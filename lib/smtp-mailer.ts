import net from "node:net";
import tls from "node:tls";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
};

type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const port = Number(process.env.SMTP_PORT || "587");
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_SECURE === "1" ||
    port === 465;

  if (!host || !user || !pass || !from) {
    throw new Error(
      "Falta configurar SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM.",
    );
  }

  return { host, port, user, pass, from, secure };
}

function encodeHeader(value: string) {
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

function normalizeAddress(value: string) {
  return value.replace(/[<>\r\n]/g, "").trim();
}

function createMessage(from: string, message: MailMessage) {
  const safeFrom = normalizeAddress(from);
  const safeTo = normalizeAddress(message.to);
  const body = message.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");

  return [
    `From: Direct Group <${safeFrom}>`,
    `To: ${safeTo}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

export async function sendSmtpMail(message: MailMessage) {
  const config = getSmtpConfig();
  let socket: net.Socket | tls.TLSSocket = config.secure
    ? tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host,
      })
    : net.connect({ host: config.host, port: config.port });

  socket.setEncoding("utf8");
  socket.setTimeout(30000);

  let buffer = "";

  function waitForResponse() {
    return new Promise<string>((resolve, reject) => {
      const onData = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const completed = lines.find((line) => /^\d{3} /.test(line));
        if (!completed) return;
        cleanup();
        const response = buffer;
        buffer = "";
        if (/^[45]\d{2}/.test(completed)) reject(new Error(response.trim()));
        else resolve(response);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error("Timeout conectando con el servidor SMTP."));
      };
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
      };
      socket.on("data", onData);
      socket.on("error", onError);
      socket.on("timeout", onTimeout);
    });
  }

  async function command(value: string) {
    socket.write(`${value}\r\n`);
    return waitForResponse();
  }

  await waitForResponse();
  let ehlo = await command("EHLO directgroup.local");

  if (!config.secure && ehlo.includes("STARTTLS")) {
    await command("STARTTLS");
    socket = tls.connect({
      socket,
      servername: config.host,
    });
    socket.setEncoding("utf8");
    socket.setTimeout(30000);
    ehlo = await command("EHLO directgroup.local");
  }

  await command("AUTH LOGIN");
  await command(Buffer.from(config.user).toString("base64"));
  await command(Buffer.from(config.pass).toString("base64"));
  await command(`MAIL FROM:<${normalizeAddress(config.from)}>`);
  await command(`RCPT TO:<${normalizeAddress(message.to)}>`);
  await command("DATA");
  socket.write(`${createMessage(config.from, message)}\r\n.\r\n`);
  await waitForResponse();
  await command("QUIT").catch(() => undefined);
  socket.end();

  return { from: config.from };
}

export function getConfiguredMailFrom() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || null;
}
