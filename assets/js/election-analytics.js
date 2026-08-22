(function (global) {
  'use strict';

  function csvEscape(value) {
    const s = String(value ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function buildElectionAnalyticsCsv(analytics, positions) {
    const summary = analytics?.summary || {};
    const byPosition = analytics?.byPosition || [];
    const rows = analytics?.rows || [];
    const titles = Object.fromEntries(
      (positions || []).map((p) => [
        p.id,
        `${p.board === 'welfare' ? 'Welfare' : 'Association'} · ${p.title}`,
      ])
    );
    const lines = [];
    lines.push('Taunet Nelel election analytics');
    lines.push(`Exported,${csvEscape(new Date().toISOString())}`);
    lines.push('');
    lines.push('Summary');
    lines.push('Metric,Value');
    [
      ['Cycle', summary.cycle_title],
      ['Stage', summary.phase],
      ['Portal open', summary.portal_open ? 'yes' : 'no'],
      ['Expressions of interest', summary.expressions],
      ['Withdrawn', summary.withdrawn],
      ['On ballot', summary.on_ballot],
      ['Association EOIs', summary.association_expressions],
      ['Welfare EOIs', summary.welfare_expressions],
      ['Nominations cast', summary.nominations],
      ['Unique nominators', summary.unique_nominators],
      ['Votes cast', summary.votes],
      ['Unique voters', summary.unique_voters],
    ].forEach((row) => lines.push(row.map(csvEscape).join(',')));

    lines.push('');
    lines.push('By office');
    lines.push(
      'Board,Office,Seats,EOIs,Withdrawn,On ballot,Nominations,Unique nominators,Votes,Unique voters'
    );
    byPosition.forEach((pos) => {
      lines.push(
        [
          pos.board,
          pos.title,
          pos.seats,
          pos.expressions,
          pos.withdrawn,
          pos.on_ballot,
          pos.nominations,
          pos.unique_nominators,
          pos.votes,
          pos.unique_voters,
        ]
          .map(csvEscape)
          .join(',')
      );
    });

    lines.push('');
    lines.push('Candidates');
    lines.push('When,Name,Email,Phone,Board office,Statement,Status,On ballot,Nominations,Votes');
    rows.forEach((row) => {
      lines.push(
        [
          row.created_at || '',
          row.full_name || '',
          row.email || '',
          row.phone || '',
          titles[row.position_id] || row.position_id,
          row.statement || '',
          row.status || '',
          row.nominated ? 'yes' : 'no',
          row.nomination_count || 0,
          row.vote_count || 0,
        ]
          .map(csvEscape)
          .join(',')
      );
    });
    return `\uFEFF${lines.join('\r\n')}`;
  }

  function downloadElectionAnalyticsCsv(analytics, positions) {
    if (!analytics?.summary) {
      throw new Error('No election analytics to export yet.');
    }
    const csv = buildElectionAnalyticsCsv(analytics, positions);
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taunet-elections-analytics-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderElectionAnalytics(host, analytics) {
    if (!host) return;
    const summary = analytics?.summary;
    if (!summary) {
      host.innerHTML = '<p class="elections-muted">No election analytics yet.</p>';
      return;
    }
    const cards = [
      ['EOIs', summary.expressions],
      ['On ballot', summary.on_ballot],
      ['Nominations', summary.nominations],
      ['Nominators', summary.unique_nominators],
      ['Votes', summary.votes],
      ['Voters', summary.unique_voters],
    ];
    const offices = (analytics.byPosition || [])
      .map(
        (pos) =>
          `<tr>
            <td>${escapeHtml(pos.board === 'welfare' ? 'Welfare' : 'Association')}</td>
            <td>${escapeHtml(pos.title)}</td>
            <td>${pos.seats}</td>
            <td>${pos.expressions}</td>
            <td>${pos.on_ballot}</td>
            <td>${pos.nominations}</td>
            <td>${pos.votes}</td>
          </tr>`
      )
      .join('');
    host.innerHTML = `
      <div class="elections-stats">
        ${cards.map(([label, value]) => `<div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}
      </div>
      <div class="elections-table-wrap elections-table-wrap--compact">
        <table class="elections-table">
          <thead>
            <tr>
              <th>Board</th>
              <th>Office</th>
              <th>Seats</th>
              <th>EOIs</th>
              <th>Ballot</th>
              <th>Nominations</th>
              <th>Votes</th>
            </tr>
          </thead>
          <tbody>${offices || '<tr><td colspan="7">No offices found.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  global.taunetElectionAnalytics = {
    downloadCsv: downloadElectionAnalyticsCsv,
    render: renderElectionAnalytics,
  };
})(window);
