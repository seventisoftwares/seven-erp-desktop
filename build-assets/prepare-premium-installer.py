from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import json, os, sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
BUILD = ROOT / "build"
BUILD.mkdir(parents=True, exist_ok=True)

MIDNIGHT = (7, 27, 51)
NAVY2 = (14, 39, 80)
SEVEN_BLUE = (46, 101, 243)
CYAN = (24, 215, 232)
VIOLET = (124, 92, 252)
WHITE = (255, 255, 255)
LIGHT = (232, 242, 251)
MUTED = (159, 177, 199)


def font(size, bold=False):
    candidates = []
    if os.name == "nt":
        candidates += [
            r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        ]
    else:
        candidates += [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def gradient(size, a, b, horizontal=False):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = x / max(1, w - 1) if horizontal else y / max(1, h - 1)
            px[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))
    return img


def draw_brand_mark(size=1024):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(size * .22)
    # premium midnight tile
    d.rounded_rectangle((0, 0, size-1, size-1), radius=r, fill=MIDNIGHT)
    # subtle glow
    glow = Image.new("RGBA", im.size, (0,0,0,0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((int(size*.12), int(size*.05), int(size*.86), int(size*.70)), fill=(*CYAN, 28))
    gd.ellipse((int(size*.10), int(size*.42), int(size*.88), int(size*.98)), fill=(*VIOLET, 25))
    glow = glow.filter(ImageFilter.GaussianBlur(max(6, int(size*.05))))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)

    # Seven TI connected-S mark from the current visual identity
    top = [
        (int(size*.18), int(size*.26)),
        (int(size*.78), int(size*.26)),
        (int(size*.67), int(size*.45)),
        (int(size*.43), int(size*.45)),
        (int(size*.55), int(size*.57)),
        (int(size*.31), int(size*.57)),
        (int(size*.16), int(size*.40)),
    ]
    bottom = [
        (int(size*.82), int(size*.74)),
        (int(size*.22), int(size*.74)),
        (int(size*.33), int(size*.55)),
        (int(size*.57), int(size*.55)),
        (int(size*.45), int(size*.43)),
        (int(size*.69), int(size*.43)),
        (int(size*.84), int(size*.60)),
    ]
    d.polygon(top, fill=CYAN)
    d.polygon(bottom, fill=VIOLET)

    # connection traces/nodes
    lw = max(2, int(size*.012))
    d.line((int(size*.25), int(size*.31), int(size*.59), int(size*.31)), fill=(105,231,245), width=lw)
    d.line((int(size*.39), int(size*.69), int(size*.70), int(size*.69)), fill=(157,142,255), width=lw)
    nr = max(4, int(size*.018))
    for x,y in [(int(size*.76),int(size*.31)), (int(size*.23),int(size*.69))]:
        d.ellipse((x-nr,y-nr,x+nr,y+nr), fill=WHITE)
        d.ellipse((x-nr//2,y-nr//2,x+nr//2,y+nr//2), fill=SEVEN_BLUE)
    return im


icon = draw_brand_mark(1024)
icon.save(BUILD / "icon.png")
icon.save(BUILD / "installerIcon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
icon.save(BUILD / "uninstallerIcon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

# Windows NSIS sidebar: intentionally clean, dark and premium
sidebar = gradient((164,314), MIDNIGHT, NAVY2)
d = ImageDraw.Draw(sidebar)
# subtle circuit geometry
for y in (28, 72, 236, 278):
    d.line((0,y,164,y), fill=(17,58,102), width=1)
for x,y,dx in [(12,48,28),(134,90,30),(18,242,34),(127,270,36)]:
    d.line((x,y,min(163,x+dx),y), fill=CYAN, width=2)
    d.ellipse((x-2,y-2,x+2,y+2), fill=WHITE)
# icon
mini = icon.convert("RGB").resize((82,82), Image.Resampling.LANCZOS)
sidebar.paste(mini, (41,24))
# brand text
fd_b = font(15, True); fd_b2 = font(8, True); fd_r = font(8, False); fd_small = font(7, False)
d.text((14,124), "SEVEN", font=fd_b, fill=WHITE)
d.text((70,129), "PRODUÇÃO PRO", font=fd_b2, fill=CYAN)
d.rectangle((14,151,149,153), fill=SEVEN_BLUE)
d.rectangle((112,151,149,153), fill=CYAN)
d.text((14,170), "GESTÃO DE PRODUÇÃO", font=fd_b2, fill=WHITE)
d.text((14,185), "Custos • Estoque • Resultado", font=fd_r, fill=LIGHT)
d.text((14,218), "INSTALAÇÃO SEGURA", font=fd_b2, fill=CYAN)
d.text((14,232), "Seven TI Tecnologia & Serviços", font=fd_small, fill=MUTED)
d.text((14,245), "Versão 2.0.0", font=fd_small, fill=MUTED)
d.text((14,289), "Transformando tecnologia", font=fd_small, fill=(188,207,228))
d.text((14,301), "em resultados.", font=fd_small, fill=(188,207,228))
sidebar.save(BUILD / "installerSidebar.bmp", format="BMP")

un = sidebar.copy(); du = ImageDraw.Draw(un)
du.rectangle((0,0,164,24), fill=(5,16,31))
du.text((12,7), "DESINSTALAÇÃO", font=font(8,True), fill=VIOLET)
un.save(BUILD / "uninstallerSidebar.bmp", format="BMP")

# Windows header
header = gradient((150,57), (248,251,255), (222,235,249), horizontal=True)
dh = ImageDraw.Draw(header)
small = icon.convert("RGB").resize((40,40), Image.Resampling.LANCZOS)
header.paste(small, (5,8))
dh.text((51,10), "Seven Produção Pro", font=font(9,True), fill=MIDNIGHT)
dh.text((51,27), "Instalação profissional", font=font(6,False), fill=(73,93,115))
dh.rectangle((51,42,142,44), fill=SEVEN_BLUE)
dh.rectangle((112,42,142,44), fill=CYAN)
header.save(BUILD / "installerHeader.bmp", format="BMP")

# macOS DMG background
bg = gradient((720,460), (5,21,40), (14,51,91), horizontal=True).convert("RGBA")
glow = Image.new("RGBA", bg.size, (0,0,0,0))
gd = ImageDraw.Draw(glow)
gd.ellipse((430,-150,820,240), fill=(*CYAN,40))
gd.ellipse((-170,290,210,650), fill=(*VIOLET,34))
glow = glow.filter(ImageFilter.GaussianBlur(55))
bg = Image.alpha_composite(bg, glow)
db = ImageDraw.Draw(bg)
big = icon.resize((112,112), Image.Resampling.LANCZOS)
bg.alpha_composite(big, (52,48))
db.text((188,62), "SEVEN PRODUÇÃO PRO", font=font(25,True), fill=WHITE)
db.text((189,99), "Gestão inteligente da sua produção", font=font(12,False), fill=(199,215,233))
db.rectangle((189,128,520,130), fill=SEVEN_BLUE)
db.rectangle((448,128,520,130), fill=CYAN)
# central drag cue
db.rounded_rectangle((275,190,445,278), radius=18, outline=(72,126,219), width=2, fill=(7,27,51,125))
db.text((313,207), "ARRASTE", font=font(14,True), fill=WHITE)
db.text((297,236), "para Aplicativos  →", font=font(11,False), fill=CYAN)
db.text((52,399), "Seven TI Tecnologia & Serviços", font=font(9,True), fill=(173,197,221))
db.text((52,419), "Versão 2.0.0  •  macOS Universal", font=font(8,False), fill=(121,150,181))
bg.convert("RGB").save(BUILD / "dmg-background.png")

# Update electron-builder configuration
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
b = pkg.setdefault("build", {})
b.setdefault("directories", {})["buildResources"] = "build"
b["productName"] = "Seven Produção Pro"
b["artifactName"] = "Seven-Producao-Pro-${version}-${os}-${arch}.${ext}"
b.setdefault("files", [])
if "build/**" not in b["files"]:
    b["files"].append("build/**")

win = b.setdefault("win", {})
win["icon"] = "build/icon.png"
nsis = b.setdefault("nsis", {})
nsis.update({
    "oneClick": False,
    "allowToChangeInstallationDirectory": True,
    "createDesktopShortcut": True,
    "createStartMenuShortcut": True,
    "shortcutName": "Seven Produção Pro",
    "deleteAppDataOnUninstall": False,
    "runAfterFinish": True,
    "language": "1046",
    "installerLanguages": ["pt_BR"],
    "installerIcon": "build/installerIcon.ico",
    "uninstallerIcon": "build/uninstallerIcon.ico",
    "installerHeader": "build/installerHeader.bmp",
    "installerSidebar": "build/installerSidebar.bmp",
    "uninstallerSidebar": "build/uninstallerSidebar.bmp",
    "uninstallDisplayName": "Seven Produção Pro 2.0"
})
mac = b.setdefault("mac", {})
mac["icon"] = "build/icon.png"
mac["identity"] = None
b["dmg"] = {
    "background": "build/dmg-background.png",
    "window": {"width": 720, "height": 460},
    "contents": [
        {"x": 210, "y": 230, "type": "file"},
        {"x": 510, "y": 230, "type": "link", "path": "/Applications"}
    ]
}
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2), encoding="utf-8")
print("Premium installer branding prepared at", ROOT)
