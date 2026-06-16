# Site Panel Only Discord Bot

Bu sürümde Discord içinde hiçbir komut yoktur.

Yok:

- `/sunucu kur`
- `/sunucu-kur`
- `m!` prefix komutları
- Slash komutları

Var:

- Render sitesi üzerinden `/admin` paneli
- Siteden **Sunucuyu Kur**
- Siteden **Sunucuyu İmha Et**
- İmha işlemi bütün kanalları ve kategorileri siler
- Opsiyonel link/reklam engelleme
- Kendi ses kanalı oluşturma sistemi

## Render Environment Variables

```txt
TOKEN=Discord bot tokenin
GUILD_ID=Sunucu ID
DASHBOARD_PASSWORD=Panel şifresi
LINK_BLOCKER=false
```

Önce `LINK_BLOCKER=false` bırak. Bot açıldıktan sonra link engel istersen `true` yap.

Link engel aktif olacaksa Discord Developer Portal > Bot kısmından **MESSAGE CONTENT INTENT** açılmalı.

## Render ayarları

```txt
Build Command: npm install
Start Command: npm start
```

Panel:

```txt
https://senin-render-linkin.onrender.com/admin
```

## GitHub'a basma

Dosyaları doğrudan kendi repo klasörünün içine at. Sonra:

```cmd
cd /d C:\Users\Diyar\Desktop\discord-sunucu-botu
git init
git branch -M main
git remote remove origin
git remote add origin https://github.com/diyarsalli16-tech/botceusx.git
git add -A
git commit -m "Site panel only no commands"
git push -u origin main --force
```

`git remote remove origin` hata verirse devam et.
