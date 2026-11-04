#!/usr/bin/env python3
"""터미널 아날로그 시계 (초침 포함).

실행:  python3 analog_clock.py
종료:  Ctrl+C
외부 라이브러리 없이 Python 3 표준 라이브러리만 사용합니다.
"""
import math
import shutil
import sys
import time
from datetime import datetime

RESET = "\033[0m"
COLORS = {
    "rim": "\033[36m",     # 청록 - 테두리
    "num": "\033[1;37m",   # 흰색 굵게 - 숫자
    "tick": "\033[90m",    # 회색 - 분 눈금
    "hour": "\033[1;33m",  # 노랑 - 시침
    "min": "\033[1;32m",   # 초록 - 분침
    "sec": "\033[1;31m",   # 빨강 - 초침
    "center": "\033[1;35m",
}
WEEKDAYS = "월화수목금토일"


def build_frame(now, cols, rows):
    # 글자 셀은 세로가 가로의 약 2배이므로 x 방향을 2배로 늘려 원으로 보이게 함
    radius = max(5, min((rows - 4) // 2, (cols - 2) // 4))
    h = radius * 2 + 1
    w = radius * 4 + 1
    cy, cx = radius, radius * 2
    grid = [[(" ", None)] * w for _ in range(h)]

    def put(x, y, ch, color):
        xi, yi = int(round(x)), int(round(y))
        if 0 <= yi < h and 0 <= xi < w:
            grid[yi][xi] = (ch, color)

    def point(angle, r):
        # angle: 12시 방향 0, 시계방향 증가 (라디안)
        return cx + math.sin(angle) * r * 2, cy - math.cos(angle) * r

    # 테두리
    steps = int(2 * math.pi * radius * 3)
    for i in range(steps):
        x, y = point(2 * math.pi * i / steps, radius)
        put(x, y, "·", "rim")

    # 분 눈금
    for m in range(60):
        if m % 5:
            x, y = point(2 * math.pi * m / 60, radius - 0.8)
            put(x, y, ".", "tick")

    # 숫자 1~12
    for n in range(1, 13):
        x, y = point(2 * math.pi * n / 12, radius - 1.6)
        s = str(n)
        start = int(round(x)) - (len(s) - 1)
        for k, ch in enumerate(s):
            put(start + k, y, ch, "num")

    def hand(angle, length, ch, color):
        n = int(length * 4)
        for i in range(1, n + 1):
            x, y = point(angle, length * i / n)
            put(x, y, ch, color)

    sec = now.second + now.microsecond / 1e6
    minute = now.minute + sec / 60
    hour = (now.hour % 12) + minute / 60

    hand(2 * math.pi * hour / 12, radius * 0.5, "█", "hour")
    hand(2 * math.pi * minute / 60, radius * 0.75, "▓", "min")
    hand(2 * math.pi * int(now.second) / 60, radius * 0.9, "•", "sec")
    put(cx, cy, "●", "center")

    pad = " " * max(0, (cols - w) // 2)
    lines = []
    for row in grid:
        out, cur = [pad], None
        for ch, color in row:
            if color != cur:
                out.append(COLORS[color] if color else RESET)
                cur = color
            out.append(ch)
        out.append(RESET)
        lines.append("".join(out))

    digital = now.strftime("%Y-%m-%d") + f" ({WEEKDAYS[now.weekday()]})  " + now.strftime("%H:%M:%S")
    lines.append("")
    lines.append(" " * max(0, (cols - len(digital) - 2) // 2) + "\033[1;37m" + digital + RESET)
    lines.append(" " * max(0, (cols - 14) // 2) + "\033[90m종료: Ctrl+C" + RESET)
    return lines


def main():
    out = sys.stdout
    out.write("\033[?25l\033[2J")  # 커서 숨김, 화면 지우기
    last_size = None
    try:
        while True:
            size = shutil.get_terminal_size((80, 24))
            if size != last_size:
                out.write("\033[2J")
                last_size = size
            lines = build_frame(datetime.now(), size.columns, size.lines)
            out.write("\033[H" + "\n".join(line + "\033[K" for line in lines))
            out.flush()
            # 다음 초 경계까지 대기
            time.sleep(1 - (time.time() % 1) + 0.01)
    except KeyboardInterrupt:
        pass
    finally:
        out.write(RESET + "\033[?25h\033[2J\033[H")
        out.flush()


if __name__ == "__main__":
    main()
