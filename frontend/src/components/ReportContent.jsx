import React from 'react';

const OverviewTable = ({ items }) => (
  <div className="report-overview-grid">
    {items.map((item, i) => {
      const match = item.match(/^[-•]?\s*(.+?):\s*(.+)$/);
      if (!match) return <div key={i} className="report-overview-full">{item.replace(/^[-•]\s*/, '')}</div>;
      return (
        <div key={i} className="report-overview-item">
          <span className="report-overview-label">{match[1]}</span>
          <span className="report-overview-value">{match[2]}</span>
        </div>
      );
    })}
  </div>
);

const KocTable = ({ items }) => (
  <div className="report-koc-list">
    {items.map((item, i) => {
      const lines = item.split('\n').map((l) => l.trim()).filter(Boolean);
      const nameLine = lines.find((l) => /^\d+\./.test(l));
      const name = nameLine ? nameLine.replace(/^\d+\.\s*/, '') : `KOC ${i + 1}`;
      const metrics = lines.filter((l) => !/^\d+\./.test(l));
      const metricRows = metrics.map((m) => {
        const clean = m.replace(/^[-•]\s*/, '');
        const colonIdx = clean.indexOf(':');
        if (colonIdx > 0) {
          return { label: clean.slice(0, colonIdx).trim(), value: clean.slice(colonIdx + 1).trim() };
        }
        const spaceIdx = clean.indexOf(' ');
        if (spaceIdx > 0) {
          const parts = [clean.slice(0, spaceIdx).trim(), clean.slice(spaceIdx + 1).trim()];
          return { label: parts[0], value: parts[1] };
        }
        return { label: '', value: clean };
      });
      return (
        <details key={i} className="report-koc-card" open={i < 3}>
          <summary className="report-koc-summary">{name}</summary>
          <div className="report-koc-metrics">
            {metricRows.map((row, j) => (
              <div key={j} className="report-koc-metric">
                <span className="report-koc-metric-label">{row.label}</span>
                <span className="report-koc-metric-value">{row.value}</span>
              </div>
            ))}
          </div>
        </details>
      );
    })}
  </div>
);

const ReportContent = ({ content }) => {
  if (!content) return null;

  const parts = content.split(/\n\n(?=###|ĐIỂM NỔI BẬT|ĐIỂM CẦN CẢI THIỆN|ĐỀ XUẤT HÀNH ĐỘNG)/);
  const factualPart = parts[0];
  const aiPart = parts.slice(1).join('\n\n');

  const lines = factualPart.split('\n');
  const sections = [];
  let currentSection = null;
  let currentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^[A-ZÀ-Ỹ ]{4,}$/.test(trimmed) && !trimmed.startsWith('-') && !trimmed.startsWith('•')) {
      if (currentSection) {
        sections.push({ title: currentSection, lines: currentLines });
      }
      currentSection = trimmed;
      currentLines = [];
    } else if (currentSection) {
      currentLines.push(lines[i]);
    }
  }
  if (currentSection) {
    sections.push({ title: currentSection, lines: currentLines });
  }

  return (
    <div className="report-content report-content--formatted">
      {sections.map((section, si) => {
        const nonEmptyLines = section.lines.map((l) => l.trim()).filter(Boolean);

        if (/^BÁO CÁO/.test(section.title)) {
          const periodLine = nonEmptyLines.find((l) => l.startsWith('Kỳ'));
          return (
            <header key={si} className="report-header">
              <h2 className="report-header__title">{section.title}</h2>
              {periodLine ? <p className="report-header__period">{periodLine}</p> : null}
            </header>
          );
        }

        if (section.title === 'TỔNG QUAN') {
          return (
            <section key={si} className="report-section">
              <h3 className="report-section__title">{section.title}</h3>
              <OverviewTable items={nonEmptyLines} />
            </section>
          );
        }

        if (section.title === 'ĐÁNH GIÁ THEO KOC') {
          const kocEntries = [];
          let current = [];
          for (const line of nonEmptyLines) {
            if (/^\d+\.\s/.test(line)) {
              if (current.length) {
                kocEntries.push(current.join('\n'));
              }
              current = [line];
            } else if (current.length) {
              current.push(line);
            }
          }
          if (current.length) kocEntries.push(current.join('\n'));

          if (!kocEntries.length || kocEntries.length === 1 && kocEntries[0].startsWith('-')) {
            return (
              <section key={si} className="report-section">
                <h3 className="report-section__title">{section.title}</h3>
                <p className="report-empty-text">{nonEmptyLines[0]}</p>
              </section>
            );
          }

          return (
            <section key={si} className="report-section">
              <h3 className="report-section__title">{section.title}</h3>
              <KocTable items={kocEntries} />
            </section>
          );
        }

        if (section.title === 'LƯU Ý DỮ LIỆU') {
          return (
            <section key={si} className="report-section report-section--notes">
              <h3 className="report-section__title">{section.title}</h3>
              <ul className="report-notes">
                {nonEmptyLines.map((line, li) => (
                  <li key={li}>{line.replace(/^[-•]\s*/, '')}</li>
                ))}
              </ul>
            </section>
          );
        }

        return (
          <section key={si} className="report-section">
            <h3 className="report-section__title">{section.title}</h3>
            <pre className="report-section__raw">{nonEmptyLines.join('\n')}</pre>
          </section>
        );
      })}

      {aiPart ? (
        <section className="report-section report-section--ai">
          <h3 className="report-section__title">PHÂN TÍCH AI</h3>
          <div className="report-ai-content">
            {aiPart.split('\n').filter(Boolean).map((block, bi) => {
              if (/^###/.test(block)) {
                return <h4 key={bi} className="report-ai-heading">{block.replace(/^###\s*/, '')}</h4>;
              }
              if (/^[-•]/.test(block)) {
                return <li key={bi} className="report-ai-item">{block.replace(/^[-•]\s*/, '')}</li>;
              }
              return <p key={bi} className="report-ai-paragraph">{block}</p>;
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default ReportContent;