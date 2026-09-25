const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const values = Object.fromEntries(source.split(/\r?\n/).map(line => line.match(/^\s*([^#=]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]));
const config = { supabaseUrl: values.EXPO_PUBLIC_SUPABASE_URL, supabasePublishableKey: values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Missing Supabase public configuration in .env.local.');
fs.writeFileSync(path.join(__dirname, 'runtime-config.json'), JSON.stringify(config, null, 2));
