/**
 * Election analytics helpers: summaries and Excel-friendly CSV.
 */

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function uniqueCount(rows, key) {
  return new Set((rows || []).map((row) => String(row[key] || '').toLowerCase()).filter(Boolean)).size;
}

function buildElectionAnalytics({ cycle, positions, expressions, nominations, votes }) {
  const posList = positions || [];
  const rows = (expressions || []).map((row) => {
    const nominationCount = (nominations || []).filter((n) => n.expression_id === row.id).length;
    const voteCount = (votes || []).filter((v) => v.expression_id === row.id).length;
    return {
      ...row,
      nominated: Boolean(row.nominated),
      nomination_count: nominationCount,
      vote_count: voteCount,
    };
  });

  const withdrawn = rows.filter((row) => row.status === 'withdrawn').length;
  const active = rows.filter((row) => row.status !== 'withdrawn');
  const onBallot = active.filter((row) => row.nominated).length;
  const association = active.filter((row) => {
    const pos = posList.find((p) => p.id === row.position_id);
    return pos?.board === 'association';
  }).length;
  const welfare = active.filter((row) => {
    const pos = posList.find((p) => p.id === row.position_id);
    return pos?.board === 'welfare';
  }).length;

  const byPosition = posList.map((pos) => {
    const people = rows.filter((row) => row.position_id === pos.id);
    const live = people.filter((row) => row.status !== 'withdrawn');
    return {
      position_id: pos.id,
      board: pos.board,
      title: pos.title,
      seats: Number(pos.seats) || 1,
      expressions: live.length,
      withdrawn: people.filter((row) => row.status === 'withdrawn').length,
      on_ballot: live.filter((row) => row.nominated).length,
      nominations: (nominations || []).filter((n) => n.position_id === pos.id).length,
      unique_nominators: uniqueCount(
        (nominations || []).filter((n) => n.position_id === pos.id),
        'nominator_email'
      ),
      votes: (votes || []).filter((v) => v.position_id === pos.id).length,
      unique_voters: uniqueCount(
        (votes || []).filter((v) => v.position_id === pos.id),
        'voter_email'
      ),
    };
  });

  const summary = {
    cycle_title: cycle?.title || 'Elections',
    phase: cycle?.phase || 'eoi',
    portal_open: cycle?.is_open !== false && cycle?.phase !== 'closed',
    expressions: active.length,
    withdrawn,
    on_ballot: onBallot,
    association_expressions: association,
    welfare_expressions: welfare,
    nominations: (nominations || []).length,
    unique_nominators: uniqueCount(nominations, 'nominator_email'),
    votes: (votes || []).length,
    unique_voters: uniqueCount(votes, 'voter_email'),
  };

  return { summary, byPosition, rows };
}

function buildElectionAnalyticsCsv({ summary, byPosition, rows, positions }) {
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
  const summaryRows = [
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
  ];
  summaryRows.forEach((row) => lines.push(row.map(csvEscape).join(',')));

  lines.push('');
  lines.push('By office');
  lines.push('Board,Office,Seats,EOIs,Withdrawn,On ballot,Nominations,Unique nominators,Votes,Unique voters');
  (byPosition || []).forEach((pos) => {
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
  lines.push(
    'When,Name,Email,Phone,Board office,Statement,Status,On ballot,Nominations,Votes'
  );
  (rows || []).forEach((row) => {
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

module.exports = {
  buildElectionAnalytics,
  buildElectionAnalyticsCsv,
};
