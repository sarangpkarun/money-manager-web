// Usage:
//   node scripts/push-test.mjs keys                         -> prints a VAPID key pair (put the public key in VITE_VAPID_PUBLIC_KEY)
//   VAPID_PUBLIC=... VAPID_PRIVATE=... node scripts/push-test.mjs send '<subscription json>'
import webpush from 'web-push'

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'keys') {
  console.log(webpush.generateVAPIDKeys())
} else if (cmd === 'send' && arg) {
  webpush.setVapidDetails('mailto:admin@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE)
  const res = await webpush.sendNotification(
    JSON.parse(arg),
    JSON.stringify({ title: 'Money Manager', body: 'Push spike works', url: '/' }),
  )
  console.log('sent', res.statusCode)
} else {
  console.log('usage: keys | send <subscription-json>')
  process.exit(1)
}
