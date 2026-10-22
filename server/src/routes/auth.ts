import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { asyncHandler, HttpError } from '../http.js';
import { requireAuth, setAuthCookie, clearAuthCookie, signToken } from '../middleware/auth.js';
import { Business, BusinessSettings, User } from '../models.js';
import { presentBusiness, presentSettings, presentUser } from '../present.js';
import { changePasswordSchema, forgotSchema, loginSchema, registerSchema, resetSchema } from '../schemas.js';
import { shopLoginAllowed } from '../shopAccess.js';
import { parseBody } from '../validate.js';

export const authRouter = Router();

async function session(user: InstanceType<typeof User>) {
  const business = user.businessId ? await Business.findById(user.businessId) : null;
  const settings = user.businessId ? await BusinessSettings.findOne({ businessId: user.businessId }) : null;
  return {
    user: presentUser(user),
    business: business ? presentBusiness(business) : null,
    settings: settings ? presentSettings(settings) : null,
  };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    if (!config.isTest) throw new HttpError(403, 'New accounts are closed. Sign in with the KS Sports login.');
    const body = parseBody(registerSchema, req.body);
    const email = body.email.toLowerCase();
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.');
    const user = await User.create({
      name: body.name,
      email,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: 'owner',
    });
    const token = signToken({ id: String(user._id), tokenVersion: user.tokenVersion, role: user.role });
    setAuthCookie(req, res, token);
    res.status(201).json({ ...(await session(user)), token });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const email = body.email.toLowerCase();
    const user = shopLoginAllowed(email) ? await User.findOne({ email }) : null;
    const match = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !match) throw new HttpError(401, 'Email or password is incorrect.');
    const token = signToken({ id: String(user._id), tokenVersion: user.tokenVersion, role: user.role });
    setAuthCookie(req, res, token);
    res.json({ ...(await session(user)), token });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    clearAuthCookie(req, res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.id);
    if (!user) throw new HttpError(401, 'Sign in to continue.');
    res.json(await session(user));
  }),
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = parseBody(forgotSchema, req.body);
    const user = await User.findOne({ email: body.email.toLowerCase() });
    let resetUrl: string | undefined;
    if (user && shopLoginAllowed(user.email)) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
      user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      resetUrl = `/reset/${token}`;
      console.info(`Password reset for ${user.email}: ${resetUrl}`);
    }
    res.json({
      message: 'If an account exists for that email, a reset link is ready.',
      ...(config.exposeResetLink && resetUrl ? { resetUrl } : {}),
    });
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = parseBody(resetSchema, req.body);
    const hash = crypto.createHash('sha256').update(body.token).digest('hex');
    const user = await User.findOne({
      resetTokenHash: hash,
      resetTokenExpires: { $gt: new Date() },
    });
    if (!user || !shopLoginAllowed(user.email)) throw new HttpError(400, 'This reset link is invalid or has expired.');
    user.passwordHash = await bcrypt.hash(body.password, 10);
    user.tokenVersion += 1;
    user.resetTokenHash = '';
    user.resetTokenExpires = null;
    await user.save();
    clearAuthCookie(req, res);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(changePasswordSchema, req.body);
    const user = await User.findById(req.auth!.id);
    if (!user) throw new HttpError(401, 'Sign in to continue.');
    const match = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!match) throw new HttpError(400, 'Current password is incorrect.');
    user.passwordHash = await bcrypt.hash(body.newPassword, 10);
    user.tokenVersion += 1;
    await user.save();
    const token = signToken({ id: String(user._id), tokenVersion: user.tokenVersion, role: user.role });
    setAuthCookie(req, res, token);
    res.json({ ok: true, token });
  }),
);
