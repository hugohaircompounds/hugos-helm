import { shell } from 'electron';
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import http from 'node:http';
import crypto from 'node:crypto';
import keytar from 'keytar';
import { getSettings, saveSettings } from '../db';

const SERVICE = 'helm';
const ACCT_CLICKUP = 'clickup.token';
const ACCT_GOOGLE_REFRESH = 'google.refresh_token';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const OAUTH_PORT = Number(process.env.HELM_OAUTH_PORT || 53217);
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}/callback`;

// ---------- secret storage ----------

export async function getClickUpToken(): Promise<string | null> {
  return (await keytar.getPassword(SERVICE, ACCT_CLICKUP)) || null;
}

export async function setClickUpToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    await keytar.deletePassword(SERVICE, ACCT_CLICKUP);
    saveSettings({ clickupConnected: false });
    return;
  }
  await keytar.setPassword(SERVICE, ACCT_CLICKUP, trimmed);
  saveSettings({ clickupConnected: true });
}

export async function clearClickUpToken(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCT_CLICKUP);
  saveSettings({ clickupConnected: false, clickupWorkspaceId: null, clickupUserId: null });
}

async function getGoogleRefreshToken(): Promise<string | null> {
  return (await keytar.getPassword(SERVICE, ACCT_GOOGLE_REFRESH)) || null;
}

async function setGoogleRefreshToken(tok: string): Promise<void> {
  await keytar.setPassword(SERVICE, ACCT_GOOGLE_REFRESH, tok);
}

export async function clearGoogleCreds(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCT_GOOGLE_REFRESH);
  saveSettings({ googleConnected: false });
}

// ---------- google oauth ----------

export function setGoogleClientCreds(clientId: string, clientSecret: string): void {
  saveSettings({
    googleClientId: clientId.trim(),
    googleClientSecret: clientSecret.trim(),
  });
}

function buildClient(): OAuth2Client {
  const s = getSettings();
  if (!s.googleClientId || !s.googleClientSecret) {
    throw new Error(
      'Google OAuth client id/secret not configured. Paste them in Settings > Google first.'
    );
  }
  return new google.auth.OAuth2(s.googleClientId, s.googleClientSecret, REDIRECT_URI);
}

export async function getAuthedGoogleClient(): Promise<OAuth2Client> {
  const refresh = await getGoogleRefreshToken();
  if (!refresh) throw new Error('Not connected to Google. Connect it from Settings.');
  const client = buildClient();
  client.setCredentials({ refresh_token: refresh });
  return client;
}

/**
 * Run the loopback OAuth flow. Opens the system browser, awaits the redirect.
 * On success stores the refresh token in the OS keychain.
 */
export async function connectGoogle(): Promise<{ ok: boolean; error?: string }> {
  let client: OAuth2Client;
  try {
    client = buildClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    redirect_uri: REDIRECT_URI,
  });

  return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        /* noop */
      }
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      if (!req.url) return;
      const u = new URL(req.url, REDIRECT_URI);
      if (u.pathname !== '/callback') {
        res.writeHead(404).end('not found');
        return;
      }
      const code = u.searchParams.get('code');
      const returnedState = u.searchParams.get('state');
      const oauthError = u.searchParams.get('error');

      if (oauthError) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(oauthPage('Google returned an error. You can close this tab.'));
        return finish({ ok: false, error: oauthError });
      }
      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(oauthPage('Invalid OAuth response. You can close this tab.'));
        return finish({ ok: false, error: 'invalid oauth response' });
      }

      try {
        const { tokens } = await client.getToken({ code, redirect_uri: REDIRECT_URI });
        await persistTokens(tokens);
        res
          .writeHead(200, { 'Content-Type': 'text/html' })
          .end(oauthPage('Google connected. You can close this tab and return to Helm.'));
        finish({ ok: true });
      } catch (e) {
        const msg = (e as Error).message;
        res.writeHead(500, { 'Content-Type': 'text/html' }).end(oauthPage('Token exchange failed. ' + msg));
        finish({ ok: false, error: msg });
      }
    });

    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      shell.openExternal(authUrl).catch((e) => finish({ ok: false, error: e.message }));
    });

    server.on('error', (e) => finish({ ok: false, error: e.message }));

    // Safety net — abandon after 5 minutes.
    setTimeout(() => finish({ ok: false, error: 'oauth timed out' }), 5 * 60 * 1000).unref();
  });
}

async function persistTokens(tokens: Credentials): Promise<void> {
  if (tokens.refresh_token) {
    await setGoogleRefreshToken(tokens.refresh_token);
  }
  saveSettings({ googleConnected: true });
}

function oauthPage(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Helm</title>
  <style>body{font-family:system-ui;padding:40px;max-width:520px;margin:auto;color:#222}</style>
  </head><body><h1>Helm</h1><p>${body}</p></body></html>`;
}
