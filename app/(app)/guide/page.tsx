export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
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
          edit any cell directly, just like in Excel — plus a few things Excel can&rsquo;t do,
          like seeing bank-balance impacts update live as you type.
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
        <h2 className="text-lg font-semibold text-zinc-900">The four things you&rsquo;ll do most</h2>
        <div className="space-y-3">
          <Step n={1} title="Update an amount">
            Go to <strong>Forecast → Detail</strong>. Click any cell, type a new number, press
            <Kbd>Enter</Kbd>. The save chip in the corner shows when it&rsquo;s saved.
            Subtotals, Net Operating, Closing Balance and Available Cash all update
            instantly. Made a mistake? <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd>.
          </Step>
          <Step n={2} title="Bring in actuals from a document">
            Go to <strong>Documents</strong>, drop the file in. Wait a few seconds. Anything
            the AI is confident about is added automatically — items it&rsquo;s unsure about
            land in <em>Needs Attention</em>. Use the <em>Select all</em> box and the bulk
            dropdowns to fill a missing field across many rows at once.
          </Step>
          <Step n={3} title="Add a new project">
            Go to <strong>Pipeline → Overview</strong>. Add the client and project, then split
            the fee across months. Once you set the project to <em>Confirmed</em>, the revenue
            and third-party costs automatically appear in the Forecast.
          </Step>
          <Step n={4} title="Find something">
            Anywhere in the Detail grid, press <Kbd>Ctrl</Kbd>+<Kbd>F</Kbd>. Search by
            counterparty, notes, or an amount (&ldquo;1500&rdquo;, &ldquo;$1,500&rdquo;, or
            &ldquo;(500)&rdquo; for a negative). <Kbd>Enter</Kbd> / <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd>
            to cycle matches. Tick <em>Only matching rows</em> to hide everything else.
          </Step>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Selecting cells</h2>
        <p className="text-sm text-zinc-700">
          Many actions (delete, set status, shift, duplicate, copy forward, export, group)
          work on a selection. A few ways to make one:
        </p>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Shortcut k="Click">Pick one cell.</Shortcut>
            <Shortcut k="Click + drag">Pick a rectangular range.</Shortcut>
            <Shortcut k="Shift + Click">Extend the range to here.</Shortcut>
            <Shortcut k="Shift + Arrow">Extend the range one cell.</Shortcut>
            <Shortcut k="Ctrl + Click">Add (or remove) individual cells.</Shortcut>
            <Shortcut k="Esc">Clear the selection.</Shortcut>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            Selecting 2+ cells reveals a live <strong>Σ / ⌀ / # / min / max</strong> chip in
            the controls bar — quick sums without a scratch cell.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Editing the grid (Excel-style)</h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Edit a cell</p>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Shortcut k="Click + type">Overwrite a cell.</Shortcut>
            <Shortcut k="F2">Edit without overwriting.</Shortcut>
            <Shortcut k="Enter / Shift+Enter">Move down / up.</Shortcut>
            <Shortcut k="Tab / Shift+Tab">Move right / left.</Shortcut>
            <Shortcut k="Esc">Cancel an edit.</Shortcut>
            <Shortcut k="Edit a subtotal">Change is split proportionally across the lines below it.</Shortcut>
          </dl>

          <p className="mt-5 mb-3 text-xs uppercase tracking-wide text-zinc-500">Select cells</p>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Shortcut k="Click + drag">Pick a rectangular range.</Shortcut>
            <Shortcut k="Shift + Click">Extend the range to here.</Shortcut>
            <Shortcut k="Shift + Arrow">Extend the range one cell.</Shortcut>
            <Shortcut k="Ctrl + Click">Add (or remove) individual cells — multi-cell.</Shortcut>
            <Shortcut k="Ctrl + Home / End">Jump to the top-left / bottom-right.</Shortcut>
            <Shortcut k="Ctrl + Arrow">Jump to the edge of the data region.</Shortcut>
          </dl>

          <p className="mt-5 mb-3 text-xs uppercase tracking-wide text-zinc-500">Act on a selection</p>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Shortcut k="Delete / Backspace">Clear the selected cells.</Shortcut>
            <Shortcut k="Ctrl + C / Ctrl + V">Copy and paste from Excel.</Shortcut>
            <Shortcut k="Ctrl + D">Duplicate selection to the next week.</Shortcut>
            <Shortcut k="Alt + → / Alt + ←">Shift the selection one week forward / back.</Shortcut>
            <Shortcut k="Ctrl + Z">Undo — covers edits, status changes, shifts, creates.</Shortcut>
            <Shortcut k="Ctrl + Y / Ctrl+Shift+Z">Redo.</Shortcut>
            <Shortcut k="Drag the corner">Fill across cells.</Shortcut>
            <Shortcut k="Double-click the corner">Auto-fill down to the end of the section.</Shortcut>
            <Shortcut k="Right-click a cell">Split its value across the next few weeks.</Shortcut>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            Cells with a Pipeline badge come from a confirmed project — edit those in the
            Pipeline tab, not here.
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          A small indigo <span className="font-mono">=</span> in the top-left means the cell
          is driven by a formula. An amber dot in the top-right means there&rsquo;s a note
          (hover to read it).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Formulas</h2>
        <p className="text-sm leading-6 text-zinc-700">
          Type <Kbd>=</Kbd> as the first character of a cell to write a formula instead of a
          number. The cell shows the calculated value; hover to see the expression. Edit the
          formula by pressing <Kbd>F2</Kbd> on the cell.
        </p>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Shortcut k="=1500*4">Plain maths. No cell refs required.</Shortcut>
            <Shortcut k="=W1">The current row&rsquo;s week 1.</Shortcut>
            <Shortcut k="=SUM(W1:W4)">Sum of weeks 1–4 on this row.</Shortcut>
            <Shortcut k="=AVG(W1:W4)">Average.</Shortcut>
            <Shortcut k="=MAX(W1:W3)  /  =MIN(W1:W3)">Extremes.</Shortcut>
            <Shortcut k="=@Payroll:W1">Week 1 of the row whose counterparty is &ldquo;Payroll&rdquo;.</Shortcut>
            <Shortcut k="=SUM(@Payroll:W1:W4)">Cross-row range.</Shortcut>
            <Shortcut k="=IF(W1 &gt; 1000, W1, 0)">Conditional. &gt; &lt; &gt;= &lt;= == != all work.</Shortcut>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            When you edit a cell that another formula references, the dependent cell
            re-calculates automatically — one Ctrl+Z rolls back both the edit and the cascade.
            Circular references are rejected before save.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Power moves</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Set status on many cells" subtitle="Status dropdown in the controls bar.">
            <p>
              Select cells (drag or Ctrl+click to mix and match), pick a status from the
              <em> Set status</em> dropdown → applies to every editable cell at once. Pipeline
              cells are skipped automatically.
            </p>
          </Card>
          <Card title="Shift a payment" subtitle="Alt+→/Alt+← or the Shift… button.">
            <p>
              When Acme&rsquo;s invoice slips a week, select its cell and press
              <Kbd>Alt</Kbd>+<Kbd>→</Kbd>. Or click <em>Shift…</em> to move by any N weeks with
              a collision preview.
            </p>
          </Card>
          <Card title="Copy this week forward" subtitle="Copy forward… button.">
            <p>
              Select the cells for one week, click <em>Copy forward…</em>, enter the number of
              weeks. Common for rent, retainers, anything that repeats.
            </p>
          </Card>
          <Card title="Split across weeks" subtitle="Right-click a cell with a value.">
            <p>
              Right-click → <em>Split…</em> → enter comma-separated amounts. The first replaces
              the source, the rest spill into the next weeks. Great for instalment invoices.
            </p>
          </Card>
          <Card title="Group related rows" subtitle="Group… button with ≥2 rows selected.">
            <p>
              Hide detail under a collapsible header. Useful for sub-contractors, small
              vendors, anything that clutters the view. Groups live in your browser — each
              user has their own.
            </p>
          </Card>
          <Card title="Freeze the first weeks" subtitle="Freeze dropdown in the controls bar.">
            <p>
              Pin the first 1 or 2 week columns next to the label so they stay visible while
              you scroll out to week 12+. Remembered per browser.
            </p>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Documents — bulk moves</h2>
        <p className="text-sm leading-6 text-zinc-700">
          The <em>Needs Attention</em> section on the Documents tab is designed for batching.
        </p>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 space-y-3 text-sm text-zinc-700">
          <p>
            Each collapsed card shows amber <em>No entity / No bank / No category / No week /
            No status</em> badges at a glance so you know what&rsquo;s missing before opening
            it.
          </p>
          <p>
            Tick cards (or <em>Select all</em>), pick any fields in the bulk bar
            (entity / bank account / category / week / status), then either:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Apply to N selected</strong> — just fills the chosen fields. Items that become fully resolved graduate to <em>Pending Review</em>.</li>
            <li><strong>Confirm &amp; add to forecast</strong> — fills the fields <em>and</em> creates forecast lines in one click for everything that&rsquo;s now complete. Items still missing fields stay behind for individual review.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Line statuses</h2>
        <p className="text-sm text-zinc-700">
          Every forecast line has a status so you can see at a glance how solid the number is.
          Cell backgrounds are colour-coded to match.
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
        <h2 className="text-lg font-semibold text-zinc-900">Export</h2>
        <p className="text-sm leading-6 text-zinc-700">
          Click <em>Export</em> in the controls bar for three options:
        </p>
        <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
          <li><strong>Selection</strong> — just the cells you&rsquo;ve highlighted. Compact output.</li>
          <li><strong>Current view</strong> — respects your hide-empty, collapsed, and find-filter settings.</li>
          <li><strong>Entire forecast</strong> — everything.</li>
        </ul>
        <p className="text-xs text-zinc-500">
          The file downloads as a UTF-8 CSV named
          <span className="font-mono"> augusto-cashflow-&lt;scope&gt;-&lt;date&gt;.csv</span> —
          opens cleanly in Excel with numbers as numbers (no &ldquo;1,500&rdquo; quoting).
        </p>
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
            <Term label="Pipeline cell">A cell whose value was synced from a confirmed pipeline project — shown with a badge, read-only in the grid. Edit in the Pipeline tab.</Term>
            <Term label="Collision">When a shift, duplicate, copy-forward or split would overwrite an existing non-zero value. The dialog shows the count before you click Apply.</Term>
          </dl>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Stuck?</h2>
        <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
          <li>A number looks wrong → check the line&rsquo;s status and whether it&rsquo;s Pipeline-sourced.</li>
          <li>Typed something wrong → <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> works for everything you&rsquo;ve done here this session (undo does not cross page reloads).</li>
          <li>A cell won&rsquo;t accept edits → it&rsquo;s probably a Pipeline cell or an all-pipeline subtotal. Edit in the Pipeline tab instead.</li>
          <li>Document didn&rsquo;t process → re-upload it from the Documents tab — it&rsquo;ll start fresh.</li>
          <li>Save chip says &ldquo;Save failed&rdquo; → hover it for the error. Usually a network blip; try again, your edits are preserved locally.</li>
        </ul>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-800">
      {children}
    </kbd>
  )
}
