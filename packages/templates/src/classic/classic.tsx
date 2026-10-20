import type { ResumeTemplate } from '../contract.js';
import type { EntryView, ResumeView, SectionView } from '../view-model.js';
import { RichText } from '../rich-text.js';
import { classicCss } from './classic.css.js';

function Entry({ entry, compact }: { entry: EntryView; compact: boolean }) {
  const heading = entry.href ? (
    <a href={entry.href}>{entry.title || entry.subtitle}</a>
  ) : (
    entry.title || entry.subtitle
  );
  return (
    <article className={compact ? 'entry entry-compact' : 'entry'}>
      {(entry.title || entry.subtitle || entry.dates) && (
        <header className="entry-head">
          <h3 className="entry-title">
            {heading}
            {entry.title && entry.subtitle && (
              <span className="entry-subtitle">, {entry.subtitle}</span>
            )}
          </h3>
          {entry.dates && <p className="entry-dates">{entry.dates}</p>}
        </header>
      )}
      {entry.meta && <p className="entry-meta">{entry.meta}</p>}
      {entry.tags.length > 0 && <p className="entry-tags">{entry.tags.join(', ')}</p>}
      {entry.summary && <RichText text={entry.summary} className="entry-summary" />}
      {entry.bullets.length > 0 && (
        <ul className="entry-bullets">
          {entry.bullets.map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Section({ section }: { section: SectionView }) {
  if (section.type === 'links') {
    // Label and printed address, so the link still works on paper; clickable in the PDF.
    return (
      <section className="section">
        <h2 className="section-title">{section.title}</h2>
        <ul className="links">
          {section.entries.map((e) => {
            const text = (
              <>
                {e.title}
                {/* A real space, so copied or extracted text (ATS) doesn't merge the two. */}
                {e.meta && (
                  <>
                    {' '}
                    <span className="link-address">{e.meta}</span>
                  </>
                )}
              </>
            );
            return <li key={e.id}>{e.href ? <a href={e.href}>{text}</a> : text}</li>;
          })}
        </ul>
      </section>
    );
  }
  if (section.type === 'languages') {
    return (
      <section className="section">
        <h2 className="section-title">{section.title}</h2>
        <p className="inline-list">
          {section.entries
            .map((e) => (e.subtitle ? `${e.title} (${e.subtitle})` : e.title))
            .join(' · ')}
        </p>
      </section>
    );
  }
  const compact = section.type === 'skills';
  return (
    <section className="section">
      <h2 className="section-title">{section.title}</h2>
      {section.entries.map((entry) => (
        <Entry key={entry.id} entry={entry} compact={compact} />
      ))}
    </section>
  );
}

function Classic({ resume }: { resume: ResumeView }) {
  return (
    <div className="resume">
      <header className={resume.photo ? 'masthead masthead-photo' : 'masthead'}>
        {resume.photo && <img className="photo" src={resume.photo} alt="" />}
        <div className="masthead-text">
          {resume.name && <h1 className="name">{resume.name}</h1>}
          {resume.headline && <p className="headline">{resume.headline}</p>}
          {resume.contacts.length > 0 && (
            <ul className="contacts">
              {resume.contacts.map((c) => (
                <li key={c.kind}>{c.href ? <a href={c.href}>{c.label}</a> : c.label}</li>
              ))}
            </ul>
          )}
        </div>
      </header>
      {resume.summary && <RichText text={resume.summary} className="summary" />}
      {resume.sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </div>
  );
}

export const classicTemplate: ResumeTemplate = {
  id: 'classic',
  name: 'Classic',
  description: 'One column, clear headings, easy for people and applicant tracking systems.',
  css: classicCss,
  Component: Classic,
};
