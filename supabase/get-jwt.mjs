import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tnetahaviblrrjixzvbd.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_c5DxEA-z6E3YXXpUTw9D4A_5Zp8k3in'

const TEST_EMAIL = 'kingrahoot@gmail.com'
const TEST_PASSWORD = '123'

const supabase = createClient("https://tnetahaviblrrjixzvbd.supabase.co", "sb_publishable_c5DxEA-z6E3YXXpUTw9D4A_5Zp8k3in")

const { data, error } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
})

if (error) {
  console.error('SIGN IN ERROR:')
  console.error(error)
  process.exit(1)
}

console.log('\nJWT:\n')
console.log(data.session?.access_token)
console.log('\nCopy that whole token into your curl Authorization header.\n')