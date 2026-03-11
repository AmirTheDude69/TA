import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from './supabase.js';

export type AuthedRequest = Request & {
  adminUserId?: string;
};

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid session token' });
    return;
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (adminError || !admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  req.adminUserId = data.user.id;
  next();
}
