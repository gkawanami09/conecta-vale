import crypto from 'crypto'

export const MANAGER_SESSION_COOKIE_NAME = 'conecta_manager_session'
const MANAGER_SESSION_TTL_SECONDS = 60 * 60 * 12

type ManagerSessionPayload = {
  sub: 'manager'
  email: string
  iat: number
  exp: number
}

function toBase64Url(value: string | Buffer) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64')
}

function getManagerAuthSecret() {
  const secret = process.env.MANAGER_AUTH_SECRET?.trim()

  if (secret && secret.length >= 24) {
    return secret
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (fallback && fallback.length >= 24) {
    return fallback
  }

  throw new Error('Defina MANAGER_AUTH_SECRET com pelo menos 24 caracteres para o login do gestor')
}

export function getManagerEmail() {
  return process.env.MANAGER_EMAIL?.trim().toLowerCase() || 'gestor@conecta-vale.local'
}

function verifyPasswordWithHash(password: string, hashValue: string) {
  const [algorithm, salt, hashHex] = hashValue.split(':')

  if (algorithm !== 'scrypt' || !salt || !hashHex) {
    return false
  }

  const hashedBuffer = crypto.scryptSync(password, salt, 64)
  const knownHashBuffer = Buffer.from(hashHex, 'hex')

  if (hashedBuffer.length !== knownHashBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(hashedBuffer, knownHashBuffer)
}

function verifyPassword(password: string) {
  const hashValue = process.env.MANAGER_PASSWORD_HASH?.trim()

  if (hashValue) {
    return verifyPasswordWithHash(password, hashValue)
  }

  const rawPassword = process.env.MANAGER_PASSWORD || 'Gestor@123'
  const providedBuffer = Buffer.from(password)
  const expectedBuffer = Buffer.from(rawPassword)

  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

export function isManagerCredentialValid(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (normalizedEmail !== getManagerEmail()) {
    return false
  }

  if (!password) {
    return false
  }

  return verifyPassword(password)
}

function signToken(payloadEncoded: string) {
  return toBase64Url(
    crypto
      .createHmac('sha256', getManagerAuthSecret())
      .update(payloadEncoded)
      .digest()
  )
}

export function createManagerSessionToken(email: string) {
  const now = Math.floor(Date.now() / 1000)

  const payload: ManagerSessionPayload = {
    sub: 'manager',
    email,
    iat: now,
    exp: now + MANAGER_SESSION_TTL_SECONDS,
  }

  const payloadEncoded = toBase64Url(JSON.stringify(payload))
  const signature = signToken(payloadEncoded)
  return `${payloadEncoded}.${signature}`
}

export function verifyManagerSessionToken(token: string | null | undefined) {
  if (!token || typeof token !== 'string') {
    return null
  }

  const [payloadEncoded, signature] = token.split('.')
  if (!payloadEncoded || !signature) {
    return null
  }

  const expectedSignature = signToken(payloadEncoded)

  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null
  }

  try {
    const parsedPayload = JSON.parse(fromBase64Url(payloadEncoded).toString('utf8')) as ManagerSessionPayload

    if (parsedPayload.sub !== 'manager' || !parsedPayload.email || !parsedPayload.exp) {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    if (parsedPayload.exp <= now) {
      return null
    }

    return parsedPayload
  } catch {
    return null
  }
}

export function getManagerSessionFromRequest(request: {
  cookies: {
    get: (name: string) => { value: string } | undefined
  }
}) {
  const token = request.cookies.get(MANAGER_SESSION_COOKIE_NAME)?.value
  return verifyManagerSessionToken(token)
}

export function managerSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MANAGER_SESSION_TTL_SECONDS,
  }
}
