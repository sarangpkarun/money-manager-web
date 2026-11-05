import { Link } from 'react-router-dom'
import { PageHeader } from '@/ui/PageHeader'

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-1 rounded-2xl bg-surface p-4">
    <h2 className="font-medium">{title}</h2>
    <div className="space-y-2 text-sm text-muted">{children}</div>
  </section>
)

export default function PrivacyScreen() {
  return (
    <div>
      <PageHeader title="Privacy" back="/settings" backLabel="Settings" />
      <div className="space-y-3 px-4 pb-8">
        <Block title="What is stored">
          <p>Your accounts, transactions, loans, EMIs, people, notes, budgets and settings, plus your email and name. All of it sits in your own Supabase project, protected so that only your signed-in account can read or change it.</p>
        </Block>
        <Block title="What is not collected">
          <p>No analytics, no advertising, no tracking and no third-party services see your data. Nothing is sold or shared.</p>
        </Block>
        <Block title="Notifications">
          <p>If you turn reminders on, one push address per device is stored so the app can reach that device. Turning reminders off, or logging out, removes it.</p>
        </Block>
        <Block title="On this device">
          <p>A cached copy of your data and your display choices are kept in the browser so the app opens fast. Logging out clears them.</p>
        </Block>
        <Block title="Your control">
          <p><Link to="/settings/export" className="text-accent">Export</Link> everything at any time, or <Link to="/settings/delete" className="text-money-red">delete your account</Link> to remove your sign-in and every row permanently.</p>
        </Block>
      </div>
    </div>
  )
}
