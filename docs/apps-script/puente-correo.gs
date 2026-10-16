// Puente de correo de la Plataforma DG (Google Apps Script publicado como aplicación web con la
// cuenta proveedores@directgroup.com.ar). La plataforma lo llama desde el servidor por HTTPS.
//
// Pedidos (POST con JSON en el cuerpo, siempre con "token"):
//   envío (sin "action"):     { token, to, subject, body }                → { ok, from }
//   { action: "list" }:        { token, action, query?, start?, max? }     → { ok, threads, hasMore }
//   { action: "get" }:         { token, action, id }                       → { ok, thread }
//   { action: "attachment" }:  { token, action, messageId, index }         → { ok, name, contentType, data (base64) }
// Leer no marca los correos como leídos ni cambia nada en la casilla.
//
// La clave compartida va en Configuración del proyecto → Propiedades del script → RELAY_TOKEN.
// Para actualizar: pegar este código, guardar y en Implementar → Administrar implementaciones →
// editar la implementación → Versión: Nueva versión → Implementar. La URL no cambia.

var MAX_THREADS = 50;
var MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('RELAY_TOKEN');
    if (!token || data.token !== token) return reply({ ok: false, error: 'Clave del puente de correo inválida.' });
    if (data.action === 'list') return reply(listInbox(data));
    if (data.action === 'get') return reply(getThread(data));
    if (data.action === 'attachment') return reply(getAttachment(data));
    return reply(send(data));
  } catch (err) {
    return reply({ ok: false, error: String((err && err.message) || err) });
  }
}

function send(data) {
  if (!data.to || !data.subject || !data.body) return { ok: false, error: 'Faltan destinatario, asunto o texto.' };
  GmailApp.sendEmail(data.to, data.subject, data.body, { name: 'Direct Group' });
  return { ok: true, from: Session.getEffectiveUser().getEmail() };
}

function listInbox(data) {
  var start = Math.max(0, Number(data.start) || 0);
  var max = Math.min(MAX_THREADS, Math.max(1, Number(data.max) || 25));
  var query = 'in:inbox ' + String(data.query || '').slice(0, 200);
  // Se pide uno de más para saber si hay otra página.
  var threads = GmailApp.search(query, start, max + 1);
  return {
    ok: true,
    hasMore: threads.length > max,
    threads: threads.slice(0, max).map(function (thread) {
      var messages = thread.getMessages();
      var last = messages[messages.length - 1];
      var hasAttachments = messages.some(function (m) { return m.getAttachments({ includeInlineImages: false }).length > 0; });
      return {
        id: thread.getId(),
        subject: thread.getFirstMessageSubject(),
        from: last.getFrom(),
        date: thread.getLastMessageDate().toISOString(),
        snippet: last.getPlainBody().replace(/\s+/g, ' ').trim().slice(0, 180),
        messageCount: thread.getMessageCount(),
        unread: thread.isUnread(),
        hasAttachments: hasAttachments,
      };
    }),
  };
}

function getThread(data) {
  var thread = GmailApp.getThreadById(String(data.id || ''));
  if (!thread) return { ok: false, error: 'No encontré ese correo.' };
  return {
    ok: true,
    thread: {
      id: thread.getId(),
      subject: thread.getFirstMessageSubject(),
      messages: thread.getMessages().map(function (m) {
        return {
          id: m.getId(),
          from: m.getFrom(),
          to: m.getTo(),
          cc: m.getCc(),
          date: m.getDate().toISOString(),
          subject: m.getSubject(),
          body: m.getPlainBody(),
          attachments: m.getAttachments({ includeInlineImages: false }).map(function (a, index) {
            return { index: index, name: a.getName(), contentType: a.getContentType(), size: a.getSize() };
          }),
        };
      }),
    },
  };
}

function getAttachment(data) {
  var message = GmailApp.getMessageById(String(data.messageId || ''));
  if (!message) return { ok: false, error: 'No encontré ese correo.' };
  var attachment = message.getAttachments({ includeInlineImages: false })[Number(data.index)];
  if (!attachment) return { ok: false, error: 'No encontré ese adjunto.' };
  if (attachment.getSize() > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'El adjunto supera los 20 MB: descargalo desde Gmail.' };
  return {
    ok: true,
    name: attachment.getName(),
    contentType: attachment.getContentType(),
    data: Utilities.base64Encode(attachment.getBytes()),
  };
}

// Ejecutala una vez desde el editor si Google pide volver a autorizar el acceso a Gmail.
function autorizar() {
  GmailApp.getInboxUnreadCount();
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
