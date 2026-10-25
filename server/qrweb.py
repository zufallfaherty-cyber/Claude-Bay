#!/usr/bin/env python3
"""小红书 MCP 扫码登录页：自动刷新二维码，登录后提示成功。"""
import json, os, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

MCP = "http://127.0.0.1:18060/mcp"
TOKEN = os.environ.get("QR_TOKEN", "")
session_id = None
call_id = 0

def parse(text):
    for line in text.split("\n"):
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except Exception:
                pass
    try:
        return json.loads(text)
    except Exception:
        return None

def mcp_request(method, params=None, notify=False):
    global session_id, call_id
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    body = {"jsonrpc": "2.0", "method": method}
    if not notify:
        call_id += 1
        body["id"] = call_id
    if params is not None:
        body["params"] = params
    req = urllib.request.Request(MCP, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        sid = r.headers.get("mcp-session-id")
        if sid:
            session_id = sid
        return parse(r.read().decode("utf-8", "replace"))

def init():
    try:
        mcp_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "qrweb", "version": "1.0"},
        })
        mcp_request("notifications/initialized", None, notify=True)
        return True
    except Exception:
        return False

def get_qr():
    r = mcp_request("tools/call", {"name": "get_login_qrcode", "arguments": {}})
    text, img = "", None
    for c in ((r or {}).get("result", {}).get("content", []) or []):
        if c.get("type") == "text":
            text = c.get("text", "")
        if c.get("type") == "image":
            img = c.get("data")
    return text, img

def get_status():
    try:
        r = mcp_request("tools/call", {"name": "check_login_status", "arguments": {}})
        for c in ((r or {}).get("result", {}).get("content", []) or []):
            if c.get("type") == "text":
                return c.get("text", "")
    except Exception as e:
        return "查询失败: %s" % e
    return ""

PAGE = """<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>小红书扫码登录</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         background: #f5f0e8; color: #3a3a3a; margin: 0; display: flex;
         min-height: 100vh; align-items: center; justify-content: center; }
  .card { background: #fff; border-radius: 24px; box-shadow: 0 8px 40px rgba(0,0,0,.08);
          padding: 40px 32px; text-align: center; max-width: 360px; width: 100%; margin: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { font-size: 13px; color: #999; margin: 0 0 24px; }
  .qr { width: 260px; height: 260px; border-radius: 12px; }
  .hint { font-size: 14px; color: #b9452c; margin: 20px 0 8px; font-weight: 600; }
  .expire { font-size: 13px; color: #888; }
  .ok { color: #2a7d4f; font-size: 16px; font-weight: 700; margin-top: 20px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
         background: #b9452c; margin-right: 6px; animation: blink 1.2s infinite; }
  @keyframes blink { 50% { opacity: .2; } }
  .refresh { margin-top: 18px; padding: 12px 28px; font-size: 15px; color: #3a6b52;
             background: #eef5f0; border: 1px solid #cde3d4; border-radius: 14px;
             cursor: pointer; }
</style>
</head>
<body>
<div class="card">
  <h1>小红书扫码登录</h1>
  <p class="sub">Claude&Bay · 工具箱</p>
  <div id="box">%BODY%</div>
  <button onclick="location.reload()" class="refresh">换一个二维码</button>
</div>
<script>
  // 每 50 秒刷新二维码，每 6 秒查一次登录状态
  async function checkStatus() {
    try {
      const r = await fetch('/qr/status' + location.search);
      const j = await r.json();
      if (j.status && j.status.indexOf('已登录') >= 0) {
        window.__done = true;
        document.getElementById('box').innerHTML = '<div class="ok">✅ 已登录成功！</div><p class="expire" style="margin-top:12px">可以关掉这个页面了</p>';
        return true;
      }
    } catch (e) {}
    return false;
  }
  setInterval(checkStatus, 5000);
  // 4 分钟才自动刷新一次二维码，扫码期间绝不打断
  setTimeout(() => { if (!window.__done) location.reload(); }, 240000);
</script>
</body>
</html>"""

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        token = parse_qs(parsed.query).get("token", [""])[0]
        if TOKEN and token != TOKEN:
            body = b'{"error":"forbidden"}'
            self.send_response(403)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/qr/status" or path == "/status":
            st = get_status()
            body = json.dumps({"status": st}, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        text, img = get_qr()
        if img:
            body_html = (
                '<img class="qr" src="data:image/png;base64,%s" alt="QR">'
                '<p class="hint"><span class="dot"></span>请用小红书 App 扫码</p>'
                '<p class="expire">%s</p>' % (img, text.replace("<", "&lt;"))
            )
        else:
            body_html = '<p class="expire">二维码生成失败，请刷新重试</p>'
        html = PAGE.replace("%BODY%", body_html).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)

    def log_message(self, *a):
        pass

if __name__ == "__main__":
    ok = init()
    print("qrweb init:", ok, flush=True)
    HTTPServer(("127.0.0.1", 18888), H).serve_forever()
