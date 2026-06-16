require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes
} = require('discord.js');

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin';
const LINK_BLOCKER = String(process.env.LINK_BLOCKER || 'false').toLowerCase() === 'true';
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

if (!TOKEN) {
  console.error('HATA: Render Environment Variables kısmına TOKEN ekle.');
  process.exit(1);
}

if (!GUILD_ID) {
  console.error('HATA: Render Environment Variables kısmına GUILD_ID ekle.');
  process.exit(1);
}

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates];
if (LINK_BLOCKER) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });
const app = express();
const sessions = new Set();
let lastLog = [];
let createVoiceChannelId = null;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function logLine(text) {
  const line = `[${new Date().toLocaleString('tr-TR')}] ${text}`;
  console.log(line);
  lastLog.unshift(line);
  lastLog = lastLog.slice(0, 80);
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  return Boolean(cookies.panel_session && sessions.has(cookies.panel_session));
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.redirect('/admin');
  next();
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#111318;color:#f4f4f5}
  .wrap{max-width:980px;margin:34px auto;padding:0 18px}.card{background:#1b1e27;border:1px solid #2d3240;border-radius:16px;padding:22px;box-shadow:0 8px 26px rgba(0,0,0,.24)}
  h1{margin:0 0 8px;font-size:28px} p{color:#c9ced8;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:18px}
  form{margin:0}.btn{width:100%;border:0;border-radius:12px;padding:15px 18px;font-weight:800;cursor:pointer;color:#fff;font-size:16px}
  .green{background:#238636}.red{background:#da3633}.dark{background:#30363d}.blue{background:#2563eb}
  input{width:100%;padding:14px;border-radius:10px;border:1px solid #3b4252;background:#0f1117;color:#fff;margin:10px 0 14px}
  code,.log{background:#0f1117;border:1px solid #30363d;border-radius:12px;padding:14px;display:block;white-space:pre-wrap;color:#dbe4ff;overflow:auto}
  .danger{border-color:#7f1d1d;background:#241313}.small{font-size:13px;color:#aeb6c5}.row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1}
</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.get('/admin', (req, res) => {
  if (!isAuthed(req)) {
    return res.send(htmlPage('Panel Giriş', `
      <div class="card">
        <h1>Discord Sunucu Paneli</h1>
        <p>Bu botta Discord komutu yok. Her şey bu siteden yönetilir.</p>
        <form method="post" action="/admin/login">
          <input name="password" type="password" placeholder="Panel şifresi" autocomplete="current-password" required>
          <button class="btn blue" type="submit">Giriş Yap</button>
        </form>
        <p class="small">Şifre Render Environment Variables içindeki <b>DASHBOARD_PASSWORD</b> değeridir.</p>
      </div>
    `));
  }

  const ready = client.isReady();
  res.send(htmlPage('Discord Sunucu Paneli', `
    <div class="card">
      <h1>Discord Sunucu Paneli</h1>
      <p>Bot durumu: <b>${ready ? 'Aktif' : 'Bağlanıyor'}</b></p>
      <p>Bu sürümde <b>hiçbir Discord komutu yoktur</b>. Slash komut yok, prefix komut yok.</p>
      <div class="grid">
        <form method="post" action="/admin/setup" onsubmit="return confirm('Sunucu kanal düzeni kurulacak. Emin misin?')">
          <button class="btn green" type="submit">Sunucuyu Kur</button>
        </form>
        <form method="post" action="/admin/destroy" onsubmit="return confirm('DİKKAT! Bütün kanallar ve kategoriler silinecek. Emin misin?')">
          <button class="btn red" type="submit">Sunucuyu İmha Et</button>
        </form>
      </div>
      <p class="small">İmha işlemi bütün metin kanallarını, ses kanallarını ve kategorileri siler. Geri alma yoktur.</p>
    </div>
    <br>
    <div class="card">
      <h1>Log</h1>
      <div class="log">${lastLog.length ? lastLog.join('\n') : 'Henüz işlem yok.'}</div>
    </div>
  `));
});

app.post('/admin/login', (req, res) => {
  if (String(req.body.password || '') !== DASHBOARD_PASSWORD) {
    return res.status(401).send(htmlPage('Hatalı Şifre', `
      <div class="card danger">
        <h1>Hatalı şifre</h1>
        <p>Panel şifresi yanlış.</p>
        <a href="/admin"><button class="btn dark">Geri Dön</button></a>
      </div>
    `));
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  res.setHeader('Set-Cookie', `panel_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
  res.redirect('/admin');
});

app.post('/admin/setup', requireAuth, async (req, res) => {
  try {
    await setupServer();
    res.redirect('/admin');
  } catch (err) {
    logLine(`Kurulum hatası: ${err.message}`);
    res.status(500).send(htmlPage('Kurulum Hatası', `<div class="card danger"><h1>Kurulum hatası</h1><code>${escapeHtml(err.stack || err.message)}</code><br><a href="/admin"><button class="btn dark">Panele Dön</button></a></div>`));
  }
});

app.post('/admin/destroy', requireAuth, async (req, res) => {
  try {
    await destroyAllChannels();
    res.redirect('/admin');
  } catch (err) {
    logLine(`İmha hatası: ${err.message}`);
    res.status(500).send(htmlPage('İmha Hatası', `<div class="card danger"><h1>İmha hatası</h1><code>${escapeHtml(err.stack || err.message)}</code><br><a href="/admin"><button class="btn dark">Panele Dön</button></a></div>`));
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function getGuild() {
  const guild = await client.guilds.fetch(GUILD_ID);
  if (!guild) throw new Error('Sunucu bulunamadı. GUILD_ID doğru mu?');
  return guild;
}

async function clearAllApplicationCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    if (!client.user?.id) return;
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: [] });
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    logLine('Discord komutları temizlendi: slash/prefix komut yok.');
  } catch (err) {
    logLine(`Komut temizleme uyarısı: ${err.message}`);
  }
}

async function createCategory(guild, name) {
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function createText(guild, parent, name) {
  return guild.channels.create({ name, type: ChannelType.GuildText, parent: parent?.id || null });
}

async function createVoice(guild, parent, name, userLimit = 0) {
  return guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parent?.id || null, userLimit });
}

async function setupServer() {
  if (!client.isReady()) throw new Error('Bot henüz Discord’a bağlanmadı. Biraz bekleyip tekrar dene.');
  const guild = await getGuild();
  logLine('Sunucu kurulumu başladı.');

  const oyun = await createCategory(guild, '🔑 • OYUN SUNUCULARIMIZ');
  await createVoice(guild, oyun, '🎣│sunucularımız');

  const youtube = await createCategory(guild, '📌 • YouTube Bilgilendirme');
  await createText(guild, youtube, '📢│prompt-bilgi');
  await createText(guild, youtube, '🔓│prompt-onay');
  await createText(guild, youtube, '🎬│tüm-video-duyuru');
  await createText(guild, youtube, '🎬│yan-kanal-duyuru');
  await createText(guild, youtube, '🎥│videoda-olan-promptlar');
  await createText(guild, youtube, '🎬│podcast-kanalım');

  const bilgi = await createCategory(guild, '📌 • Sunucu & Bilgilendirme');
  await createText(guild, bilgi, '📢│duyurular');
  await createText(guild, bilgi, '📜│kurallar');
  await createText(guild, bilgi, '🗳│anketler');
  await createText(guild, bilgi, '💎│sunucu-boostları');
  await createText(guild, bilgi, '💎│booster-ayrıcalıkları');

  const ana = await createCategory(guild, 'Ana Kanallar');
  await createText(guild, ana, '💬│sohbet');
  await createText(guild, ana, '📸│görsel');
  await createText(guild, ana, '💡│içerik-öneri');
  await createText(guild, ana, '🤖│bot-komutları');

  const aktivite = await createCategory(guild, '🎮 • Aktivite');
  await createText(guild, aktivite, '🔥│owo');
  await createText(guild, aktivite, '🎫│ticket');

  const ses = await createCategory(guild, 'Ses Kanalları');
  await createVoice(guild, ses, '🎙│Sohbet Odası 1', 15);
  await createVoice(guild, ses, '🎙│Sohbet Odası 2', 15);
  await createVoice(guild, ses, '🎙│Sohbet Odası 3', 15);
  const createRoom = await createVoice(guild, ses, '➕│Kendi Ses Kanalını Oluştur');
  createVoiceChannelId = createRoom.id;
  const afk = await createVoice(guild, ses, '💤│AFK');
  try {
    await guild.setAFKChannel(afk, 'Panel kurulumu');
    await guild.setAFKTimeout(300, 'Panel kurulumu');
  } catch (err) {
    logLine(`AFK ayarı yapılamadı: ${err.message}`);
  }

  const hile = await createCategory(guild, 'Hile Kanalları');
  await createText(guild, hile, '💬│hile-sohbet');
  await createText(guild, hile, '📸│hile-görsel');
  await createVoice(guild, hile, '🎙│Hile Sohbet 1', 25);
  await createVoice(guild, hile, '🎙│Hile Sohbet 2', 25);
  await createVoice(guild, hile, '🎙│Hile Sohbet 3', 25);
  await createVoice(guild, hile, '🎙│Hile Sohbet 4', 50);
  await createVoice(guild, hile, '🎙│Hile Sohbet 5', 99);
  await createVoice(guild, hile, '🎙│Hile Sohbet 6', 99);

  logLine('Sunucu kurulumu tamamlandı.');
}

async function destroyAllChannels() {
  if (!client.isReady()) throw new Error('Bot henüz Discord’a bağlanmadı. Biraz bekleyip tekrar dene.');
  const guild = await getGuild();
  const channels = await guild.channels.fetch();
  const sorted = [...channels.values()]
    .filter(Boolean)
    .sort((a, b) => {
      const aCat = a.type === ChannelType.GuildCategory ? 1 : 0;
      const bCat = b.type === ChannelType.GuildCategory ? 1 : 0;
      return aCat - bCat;
    });

  logLine(`İmha başladı. Silinecek kanal/kategori sayısı: ${sorted.length}`);
  let ok = 0;
  let fail = 0;
  createVoiceChannelId = null;

  for (const channel of sorted) {
    try {
      await channel.delete('Site panelinden sunucuyu imha et');
      ok++;
      await wait(350);
    } catch (err) {
      fail++;
      logLine(`Silinemedi: ${channel.name} → ${err.message}`);
    }
  }

  logLine(`İmha bitti. Silinen: ${ok}, silinemeyen: ${fail}`);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.on('ready', async () => {
  logLine(`${client.user.tag} aktif.`);
  await clearAllApplicationCommands();

  try {
    const guild = await getGuild();
    const channels = await guild.channels.fetch();
    const createChannel = channels.find(ch => ch?.name === '➕│Kendi Ses Kanalını Oluştur' && ch.type === ChannelType.GuildVoice);
    if (createChannel) createVoiceChannelId = createChannel.id;
  } catch (err) {
    logLine(`Ses kanalı kontrol uyarısı: ${err.message}`);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    if (!createVoiceChannelId) return;
    if (newState.channelId !== createVoiceChannelId) return;

    const parent = newState.channel?.parent || null;
    const channel = await newState.guild.channels.create({
      name: `🎙│${newState.member?.displayName || 'Özel Oda'}`,
      type: ChannelType.GuildVoice,
      parent: parent?.id || null,
      userLimit: 15,
      permissionOverwrites: [
        {
          id: newState.member.id,
          allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        }
      ]
    });

    await newState.setChannel(channel).catch(() => null);

    const interval = setInterval(async () => {
      try {
        const fresh = await newState.guild.channels.fetch(channel.id).catch(() => null);
        if (!fresh) return clearInterval(interval);
        if (fresh.members.size === 0) {
          clearInterval(interval);
          await fresh.delete('Boş özel ses kanalı temizlendi').catch(() => null);
        }
      } catch (_) {
        clearInterval(interval);
      }
    }, 15000);
  } catch (err) {
    logLine(`Özel ses odası hatası: ${err.message}`);
  }
});

if (LINK_BLOCKER) {
  const linkRegex = /(https?:\/\/|www\.|discord\.gg|discord\.com\/invite|\.com|\.net|\.org|\.gg|\.io|\.xyz)/i;

  client.on('messageCreate', async message => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!linkRegex.test(message.content || '')) return;

      const allowed = message.member?.permissions?.has(PermissionFlagsBits.Administrator)
        || message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
        || message.member?.permissions?.has(PermissionFlagsBits.ManageMessages);

      if (allowed) return;

      await message.delete().catch(() => null);
      const warn = await message.channel.send(`${message.author}, link/reklam engellendi.`).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => null), 5000);
    } catch (err) {
      logLine(`Link engel hatası: ${err.message}`);
    }
  });
}

app.listen(PORT, HOST, () => {
  logLine(`Web panel aktif: ${HOST}:${PORT}`);
});

client.login(TOKEN);
