module.exports = {
  apps: [
    {
      name: "physio-galenus-backend",
      script: "main.js",
      interpreter_args: "--max_old_space_size=800",
      env: {
        //{REPLACE}
      },
    },
  ],
};
