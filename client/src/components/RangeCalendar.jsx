import { useMemo, useState } from 'react';
import { formatDate, parseIsoDate, todayIso } from '../utils.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthStart(value) {
  const date = parseIsoDate(value) || parseIsoDate(todayIso());
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function moveMonth(value, amount) {
  const date = parseIsoDate(value);
  date.setUTCMonth(date.getUTCMonth() + amount, 1);
  return monthStart(date.toISOString().slice(0, 10));
}

export function RangeCalendar({ fromDate = '', toDate = '', minDate, maxDate, holidays = [], onChange }) {
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(fromDate || todayIso()));
  const holidayMap = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday.name])), [holidays]);
  const month = parseIsoDate(visibleMonth);
  const year = month.getUTCFullYear();
  const monthNumber = month.getUTCMonth();
  const firstWeekday = (month.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber + 1, 0)).getUTCDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(isoDate(year, monthNumber, day));

  function choose(date) {
    if (!date || date < minDate || date > maxDate) return;
    if (!fromDate || (fromDate && toDate)) onChange(date, '');
    else if (date < fromDate) onChange(date, '');
    else onChange(fromDate, date);
  }

  const canGoPrevious = !minDate || moveMonth(visibleMonth, -1) >= monthStart(minDate);
  const canGoNext = !maxDate || moveMonth(visibleMonth, 1) <= monthStart(maxDate);
  const monthLabel = `${MONTH_NAMES[monthNumber]} ${year}`;

  return (
    <section className="range-calendar" aria-label="Choose leave dates">
      <div className="range-calendar-header">
        <button
          className="range-calendar-nav"
          type="button"
          aria-label="Previous month"
          disabled={!canGoPrevious}
          onClick={() => setVisibleMonth(moveMonth(visibleMonth, -1))}
        >
          ‹
        </button>
        <h3>{monthLabel}</h3>
        <button
          className="range-calendar-nav"
          type="button"
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={() => setVisibleMonth(moveMonth(visibleMonth, 1))}
        >
          ›
        </button>
      </div>
      <div className="range-calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="range-calendar-grid" role="grid" aria-label={monthLabel}>
        {cells.map((date, index) => {
          if (!date) return <span className="range-calendar-empty" key={`empty-${index}`} aria-hidden="true" />;
          const parsed = parseIsoDate(date);
          const weekend = parsed.getUTCDay() === 0 || parsed.getUTCDay() === 6;
          const holidayName = holidayMap.get(date);
          const disabled = date < minDate || date > maxDate;
          const inRange = Boolean(fromDate && toDate && date >= fromDate && date <= toDate);
          const selectedStart = date === fromDate;
          const selectedEnd = date === toDate;
          const today = date === todayIso();
          const classes = [
            'range-calendar-day',
            weekend ? 'is-weekend' : '',
            holidayName ? 'is-holiday' : '',
            disabled ? 'is-disabled' : '',
            inRange ? 'is-in-range' : '',
            selectedStart ? 'is-range-start' : '',
            selectedEnd ? 'is-range-end' : '',
            today ? 'is-today' : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              className={classes}
              key={date}
              type="button"
              disabled={disabled}
              aria-label={`${formatDate(date, { weekday: true })}${holidayName ? `, public holiday: ${holidayName}` : ''}`}
              aria-pressed={selectedStart || selectedEnd || inRange}
              title={holidayName || undefined}
              onClick={() => choose(date)}
            >
              <span>{parsed.getUTCDate()}</span>
              {holidayName && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="range-calendar-hint">Select a start date, then an end date.</p>
    </section>
  );
}
