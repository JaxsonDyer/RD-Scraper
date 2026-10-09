import 'server-only';
import { cache } from 'react';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';

export const getAuth = cache(async () => {
  if (!supabaseConfigured()) return { user: null, isAdmin: false, configured: false };
  const client = await createClient();
  // Verify against Supabase Auth, never trust a cookie's user or role fields.
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { user: null, isAdmin: false, configured: true };
  const { data: isAdmin, error: roleError } = await client.rpc('is_admin');
  const metadata = user.user_metadata;
  const name = [metadata.full_name, metadata.name].find(value => typeof value === 'string' && value.trim());
  const avatarUrl = [metadata.avatar_url, metadata.picture].find(value => typeof value === 'string' && /^https:\/\//i.test(value));
  return {
    user: {
      id: user.id,
      email: user.email ?? '',
      name: typeof name === 'string' ? name.trim() : null,
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
    },
    isAdmin: !roleError && isAdmin === true,
    configured: true,
  };
});
