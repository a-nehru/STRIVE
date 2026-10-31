"""Sequence models for frame-level compensation detection (JAX / Flax).

  LSTMNet  - recurrent baseline (the baseline used by Mesquita et al. 2025).
  AcT      - Action Transformer (Mazzia et al., Pattern Recognition 2022), re-implemented:
             each frame's pose is linearly projected to one token, a learnable [CLS] token and
             learned positional embeddings are added, a Transformer encoder runs over time,
             and the [CLS] output is classified.
  STT      - factorized Spatial-Temporal Transformer: one token per joint per frame;
             alternating spatial attention (joints within a frame) and temporal attention
             (each joint across frames), in the spirit of ST-TR / SkateFormer, without a
             fixed skeleton graph.
All take x: (B, T, J, C) and return logits (B, n_classes) for the last frame of the window.
"""
import jax.numpy as jnp
import flax.linen as nn


class EncoderBlock(nn.Module):
    d: int
    heads: int
    mlp: int
    drop: float = 0.1

    @nn.compact
    def __call__(self, x, train):
        h = nn.LayerNorm()(x)
        h = nn.MultiHeadDotProductAttention(num_heads=self.heads, qkv_features=self.d,
                                            dropout_rate=self.drop)(h, deterministic=not train)
        x = x + nn.Dropout(self.drop)(h, deterministic=not train)
        h = nn.LayerNorm()(x)
        h = nn.gelu(nn.Dense(self.mlp)(h))
        h = nn.Dropout(self.drop)(h, deterministic=not train)
        h = nn.Dense(self.d)(h)
        return x + nn.Dropout(self.drop)(h, deterministic=not train)


class LSTMNet(nn.Module):
    hidden: int = 128
    n_classes: int = 4

    @nn.compact
    def __call__(self, x, train=False):
        B, T = x.shape[:2]
        x = x.reshape(B, T, -1)
        h = nn.RNN(nn.OptimizedLSTMCell(features=self.hidden))(x)
        h = nn.RNN(nn.OptimizedLSTMCell(features=self.hidden))(h)
        h = nn.Dropout(0.2)(h[:, -1], deterministic=not train)
        return nn.Dense(self.n_classes)(h)


class AcT(nn.Module):
    d: int = 64
    heads: int = 4
    layers: int = 3
    mlp: int = 128
    drop: float = 0.1
    n_classes: int = 4

    @nn.compact
    def __call__(self, x, train=False):
        B, T = x.shape[:2]
        x = nn.Dense(self.d)(x.reshape(B, T, -1))
        cls = self.param("cls", nn.initializers.zeros, (1, 1, self.d))
        x = jnp.concatenate([jnp.tile(cls, (B, 1, 1)), x], axis=1)
        x = x + self.param("pos", nn.initializers.normal(0.02), (1, T + 1, self.d))
        x = nn.Dropout(self.drop)(x, deterministic=not train)
        for _ in range(self.layers):
            x = EncoderBlock(self.d, self.heads, self.mlp, self.drop)(x, train)
        h = nn.LayerNorm()(x[:, 0])
        h = nn.gelu(nn.Dense(self.mlp)(h))
        return nn.Dense(self.n_classes)(h)


class STT(nn.Module):
    d: int = 32
    heads: int = 4
    layers: int = 2
    mlp: int = 64
    drop: float = 0.1
    n_classes: int = 4
    tstride: int = 2          # temporal subsampling of the window (compute budget)

    @nn.compact
    def __call__(self, x, train=False):
        x = x[:, ::-1][:, ::self.tstride][:, ::-1]   # keep the current (last) frame
        B, T, J, _ = x.shape
        x = nn.Dense(self.d)(x)
        x = x + self.param("jpos", nn.initializers.normal(0.02), (1, 1, J, self.d))
        x = x + self.param("tpos", nn.initializers.normal(0.02), (1, T, 1, self.d))
        for _ in range(self.layers):
            x = EncoderBlock(self.d, self.heads, self.mlp, self.drop)(
                x.reshape(B * T, J, self.d), train).reshape(B, T, J, self.d)
            xt = x.transpose(0, 2, 1, 3).reshape(B * J, T, self.d)
            xt = EncoderBlock(self.d, self.heads, self.mlp, self.drop)(xt, train)
            x = xt.reshape(B, J, T, self.d).transpose(0, 2, 1, 3)
        x = nn.LayerNorm()(x)
        h = jnp.concatenate([x[:, -1].reshape(B, -1), x.mean(axis=(1, 2))], axis=-1)
        h = nn.gelu(nn.Dense(128)(h))
        h = nn.Dropout(self.drop)(h, deterministic=not train)
        return nn.Dense(self.n_classes)(h)


MODELS = {"LSTM": LSTMNet, "AcT": AcT, "STT": STT}
