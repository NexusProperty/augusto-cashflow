export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Guide</h1>
        <p className="mt-1 text-sm text-zinc-600">
          A quick tour of the Cash Flow app — what each tab does and how to get things done.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">What this app is</h2>
        <p className="text-sm leading-6 text-zinc-700">
          This replaces the weekly Excel cash flow workbook. It pulls together every Augusto
          entity into one rolling 18-week forecast, links revenue to the project pipeline, and
          lets you upload bank statements or invoices so the numbers update themselves. You can
          edit any cell directly, just like in Excel.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">What&rsquo;s in each tab</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Forecast" subtitle="The cash flow itself.">
            <ul className="space-y-1.5">
              <li><strong>Overview</strong> — the dashboard. Closing balances, key totals, and a 5-week snapshot.</li>
              <li><strong>Detail</strong> — the full editable grid. Every line, every week.</li>
              <li><strong>Compare</strong> — see two scenarios side by side (e.g. best vs worst).</li>
              <li><strong>Overrides</strong> — manage what-if changes without touching the base forecast.</li>
            </ul>
          </Card>
          <Card title="Pipeline" subtitle="Project revenue tracking.">
            <ul className="space-y-1.5">
              <li><strong>Overview</strong> — every project, by client, with monthly fee allocations.</li>
              <li><strong>Summary</strong> — business-unit roll-up against your targets.</li>
              <li><strong>Targets</strong> — set or edit the monthly revenue targets.</li>
            </ul>
            <p className="mt-2 text-xs text-zinc-500">
              Confirmed projects auto-flow into the Forecast as Revenue Tracker lines (with
              third-party costs split out).
            </p>
          </Card>
          <Card title="Documents" subtitle="Upload to populate the forecast.">
            <p>
              Drop in a bank statement, aged receivables, an invoice or a remittance. The AI
              reads it, suggests which entity / category / week it belongs to, and asks you to
              confirm. High-confidence items confirm themselves; you only review the rest.
            </p>
          </Card>
          <Card title="Settings" subtitle="Static configuration.">
            <p>
              Entity groups (which companies roll up where) and bank accounts (with overdraft
              limits). Set this up once; rarely changes.
            </p>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">The three things you&rsquo;ll do most</h2>
        <div className="space-y-3">
          <Step n={1} title="Update an amount">
            Go to <strong>Forecast → Detail</strong>. Click any cell, type a new number, press
            <kbd className="mx-1 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs">Enter</kbd>.
            The save chip in the corner shows when it&rsquo;s saved. Subtotals, Net Operating,
            Closing Balance and Available Cash all update instantly.
          </Step>
          <Step n={2} title="Bring in actuals from a document">
            Go to <strong>Documents</strong>, drop the file in. Wait a few seconds. Anything the
            AI is confident about is added automatically — items it&rsquo;s unsure about land in
            <em> Needs Attention</em> for you to confirm.
          </Step>
          <Step n={3} title="Add a new project">
            Go to <strong>Pipeline → Overview</strong>. Add the client and project, then split
            the fee across months. Once you set the project to <em>Confirmed</em>, the revenue
            and third-party costs automatically appear in the Forecast.
          </Step>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Editing the grid (Excel-style)</h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Shortcut k="Click + type">Overwrite a cell.</Shortcut>
            <Shortcut k="F2">Edit without overwriting.</Shortcut>
            <Shortcut k="Enter / Shift+Enter">Move down / up.</Shortcut>
            <Shortcut k="Tab / Shift+Tab">Move right / left.</Shortcut>
            <Shortcut k="Esc">Cancel an edit.</Shortcut>
            <Shortcut k="= 1500 * 4">Type a formula. <span className="text-zinc-500">No cell refs — just maths.</span></Shortcut>
            <Shortcut k="Ctrl+C / Ctrl+V">Copy and paste from Excel.</Shortcut>
            <Shortcut k="Drag the corner">Fill across cells.</Shortcut>
            <Shortcut k="Click + drag">Select a range. Hold Shift to extend.</Shortcut>
            <Shortcut k="Edit a subtotal">Change is split proportionally across the lines below it.</Shortcut>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            Cells with a Pipeline badge come from a confirmed project — edit those in the
            Pipeline tab, not here.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Line statuses</h2>
        <p className="text-sm text-zinc-700">
          Every forecast line has a status so you can see at a glance how solid the number is.
        </p>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Term label="Confirmed">Locked in — invoiced, contracted or already paid.</Term>
            <Term label="Awaiting Payment">Invoice issued, payment expected.</Term>
            <Term label="Paid">Money has moved.</Term>
            <Term label="Remittance Received">Confirmation received from payer.</Term>
            <Term label="TBC">Likely, but not yet confirmed.</Term>
            <Term label="Speculative">A best-guess placeholder.</Term>
            <Term label="Awaiting Budget Approval">Pending sign-off.</Term>
            <Term label="None">No status set.</Term>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Glossary</h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <dl className="space-y-3 text-sm">
            <Term label="Closing Balance">Bank balance at the end of a week, after all inflows and outflows for that week.</Term>
            <Term label="Net Operating">Inflows minus outflows for the week, before financing or transfers.</Term>
            <Term label="Available Cash">Closing Balance plus any unused overdraft headroom.</Term>
            <Term label="OD Facility">Overdraft limit on a bank account — the amount you can go below zero.</Term>
            <Term label="Revenue Tracker">The auto-synced revenue lines that come from confirmed pipeline projects.</Term>
            <Term label="Override">A what-if change to a forecast line that lives in a scenario, leaving the base forecast untouched.</Term>
            <Term label="Scenario">A named view (e.g. <em>Best Case</em>, <em>Worst Case</em>) made up of overrides applied to the base forecast.</Term>
          </dl>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Stuck?</h2>
        <p className="mt-1 text-sm text-zinc-700">
          If a number looks wrong, check the line&rsquo;s status and whether it&rsquo;s a
          Pipeline-sourced row. If a document didn&rsquo;t process, re-upload it from the
          Documents tab — it&rsquo;ll start fresh.
        </p>
      </section>
    </div>
  )
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
      <div className="mt-3 text-sm leading-6 text-zinc-700">{children}</div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
        {n}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-700">{children}</p>
      </div>
    </div>
  )
}

function Shortcut({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-xs text-zinc-900">{k}</dt>
      <dd className="text-zinc-600">{children}</dd>
    </div>
  )
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-zinc-900">{label}</dt>
      <dd className="text-zinc-600">{children}</dd>
    </div>
  )
}
