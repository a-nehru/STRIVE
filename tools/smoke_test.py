"""Smoke test: boot every screen and game of STRIVE in a headless browser
with a fake camera, collect console errors, take a screenshot of each.

    py -3.12 tools\\smoke_test.py [--base http://localhost:8321] [--only pong,select]

Needs Chrome or Edge on this machine and the site served (the launcher, or
python -m http.server 8321). Each ?go= target is loaded with
--use-fake-device-for-media-stream (a synthetic camera, so the boot
succeeds and the game starts; the tracker sees no body, which is the
"patient out of frame" path), --virtual-time-budget lets timers run, and
the page's console goes to a log. Fails (exit 1) on any uncaught error.
Screenshots and logs land in tools/smoke/.
"""
import argparse
import os
import re
import subprocess
import sys
import time

TOOLS = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(TOOLS, "smoke")
BROWSERS = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]
TARGETS = {
    "login": "", "select": "?go=select", "welcome": "?go=welcome", "schedule": "?go=schedule", "board": "?go=board",
    "rom": "?go=rom", "profile": "?go=profile", "collections": "?go=collections", "levels-windy": "?go=levels&game=windy",
    "levels-pong": "?go=levels&game=pong", "duo": "?go=duo", "assess": "?go=assess",
    "pong-fe": "?go=pong&axis=fe", "pong-abd": "?go=pong&axis=abd", "candles": "?go=candles", "pairs": "?go=pairs", "windy": "?go=windy",
    "warmup": "?go=warmup", "between": "?preview=pongscore", "online": "online.html",
}
ERR = re.compile(r"Uncaught|TypeError|ReferenceError|SyntaxError|is not defined|is not a function|Cannot read propert|Failed to load module", re.I)
IGNORE = re.compile(r"favicon|net::ERR_CONNECTION_REFUSED|8322|8323|8324|8325|8327|speechSynthesis|AudioContext|autoplay|GPU stall|Deprecation|third-party cookie|Content Security", re.I)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://localhost:8321")
    ap.add_argument("--only", default="")
    ap.add_argument("--budget", type=int, default=12000, help="virtual time per page, ms")
    args = ap.parse_args()
    browser = next((b for b in BROWSERS if os.path.exists(b)), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    os.makedirs(OUT, exist_ok=True)
    only = [t for t in args.only.split(",") if t]
    failed = []
    for name, q in TARGETS.items():
        if only and name not in only:
            continue
        url = f"{args.base}/{q}" if not q.startswith("?") else f"{args.base}/{q}"
        shot = os.path.join(OUT, f"{name}.png")
        logf = os.path.join(OUT, f"{name}.log")
        cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--mute-audio",
               "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required",
               "--window-size=1600,900", "--hide-scrollbars", "--enable-logging=stderr", "--v=0",
               f"--virtual-time-budget={args.budget}", f"--screenshot={shot}",
               f"--user-data-dir={os.path.join(OUT, 'profile')}", url]
        t0 = time.time()
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120, errors="ignore")
            err = r.stderr
        except subprocess.TimeoutExpired as e:
            err = (e.stderr or "") + "\nTIMEOUT"
        console = [l for l in err.splitlines() if "CONSOLE" in l or "Uncaught" in l]
        open(logf, "w", encoding="utf8").write("\n".join(console))
        bad = [l for l in console if ERR.search(l) and not IGNORE.search(l)]
        ok = not bad and os.path.exists(shot)
        print(f"{'ok  ' if ok else 'FAIL'} {name:14s} {time.time() - t0:5.1f}s  {len(console)} console lines" + (f"  {len(bad)} errors" if bad else ""))
        for l in bad[:4]:
            print("      " + re.sub(r'^.*CONSOLE[^"]*"', "", l)[:220])
        if not ok:
            failed.append(name)
    print(f"\n{len(TARGETS) - len(failed) if not only else len(only) - len(failed)} passed, {len(failed)} failed -> {OUT}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
