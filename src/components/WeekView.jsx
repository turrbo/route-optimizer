import React, { useMemo } from 'react';
import useRouteStore from '../store/routeStore';
import { detectDuplicateAreas, formatDistance, formatDuration } from '../utils/routing';
import './WeekView.css';

/**
 * Generate array of 5 weekday dates (Mon-Fri) from a start date
 */
const getWeekDays = (startDateStr) => {
  const startDate = new Date(startDateStr);
  const days = [];

  for (let i = 0; i < 5; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    days.push({
      date: date.toISOString().split('T')[0],
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: date.getDate(),
      monthName: date.toLocaleDateString('en-US', { month: 'short' })
    });
  }

  return days;
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayStr = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Get the Monday of the current week
 */
const getMondayOfWeek = (dateStr) => {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toISOString().split('T')[0];
};

/**
 * Navigate to previous/next week
 */
const navigateWeek = (currentStart, direction) => {
  const date = new Date(currentStart);
  date.setDate(date.getDate() + (direction * 7));
  return date.toISOString().split('T')[0];
};

export const WeekView = () => {
  const {
    stops,
    activeDay,
    setActiveDay,
    setActiveView,
    weekStartDate,
    setWeekStartDate,
    routes
  } = useRouteStore();

  const todayStr = getTodayStr();

  // Generate week days array
  const weekDays = useMemo(() => getWeekDays(weekStartDate), [weekStartDate]);

  // Get stops grouped by day
  const stopsByDay = useMemo(() => {
    const grouped = {};
    weekDays.forEach(day => {
      grouped[day.date] = stops.filter(stop => stop.dayDate === day.date);
    });
    return grouped;
  }, [stops, weekDays]);

  // Get route status for each day (green = optimized, blue = original only, gray = none)
  const getRouteStatus = (dayDate) => {
    const dayRoute = routes[dayDate];
    if (!dayRoute) return 'none';
    if (dayRoute.optimized) return 'optimized';
    if (dayRoute.original) return 'original';
    return 'none';
  };

  // Detect duplicate areas across the entire week
  const allWeekStops = useMemo(() => {
    return stops.filter(stop =>
      weekDays.some(day => day.date === stop.dayDate)
    );
  }, [stops, weekDays]);

  const duplicateWarnings = useMemo(() => {
    const rawDuplicates = detectDuplicateAreas(allWeekStops);
    return Object.entries(rawDuplicates).map(([area, days]) => ({ area, days }));
  }, [allWeekStops]);

  // Calculate week summary stats
  const weekStats = useMemo(() => {
    let totalStops = 0;
    let totalDistance = 0;
    let totalDuration = 0;

    weekDays.forEach(day => {
      const dayStops = stopsByDay[day.date];
      totalStops += dayStops.length;

      const dayRoute = routes[day.date];
      if (dayRoute) {
        const route = dayRoute.optimized || dayRoute.original;
        if (route) {
          totalDistance += route.distance || 0;
          totalDuration += route.duration || 0;
        }
      }
    });

    return {
      totalStops,
      totalDistance,
      totalDuration,
      duplicateCount: duplicateWarnings.length
    };
  }, [weekDays, stopsByDay, routes, duplicateWarnings]);

  // Handle day card click
  const handleDayClick = (dayDate) => {
    setActiveDay(dayDate);
    setActiveView('planner');
  };

  // Navigation handlers
  const handlePreviousWeek = () => {
    setWeekStartDate(navigateWeek(weekStartDate, -1));
  };

  const handleNextWeek = () => {
    setWeekStartDate(navigateWeek(weekStartDate, 1));
  };

  const handleThisWeek = () => {
    setWeekStartDate(getMondayOfWeek(todayStr));
  };

  // Format week range for header
  const weekRangeText = useMemo(() => {
    const firstDay = weekDays[0];
    const lastDay = weekDays[4];
    return `Week of ${firstDay.monthName} ${firstDay.dayNum} - ${lastDay.monthName} ${lastDay.dayNum}`;
  }, [weekDays]);

  return (
    <div className="week-view">
      {/* Week Navigation Header */}
      <div className="week-header">
        <h2 className="week-title">{weekRangeText}</h2>
        <div className="week-nav-buttons">
          <button
            className="week-nav-btn"
            onClick={handlePreviousWeek}
            aria-label="Previous week"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" />
            </svg>
            Previous
          </button>
          <button
            className="week-today-btn"
            onClick={handleThisWeek}
          >
            This Week
          </button>
          <button
            className="week-nav-btn"
            onClick={handleNextWeek}
            aria-label="Next week"
          >
            Next
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Week Grid - 5 Day Cards */}
      <div className="week-grid">
        {weekDays.map((day) => {
          const dayStops = stopsByDay[day.date];
          const isToday = day.date === todayStr;
          const routeStatus = getRouteStatus(day.date);
          const dayRoute = routes[day.date];
          const route = dayRoute?.optimized || dayRoute?.original;

          return (
            <div
              key={day.date}
              className={`day-card ${isToday ? 'is-today' : ''} ${day.date === activeDay ? 'is-active' : ''}`}
              onClick={() => handleDayClick(day.date)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleDayClick(day.date);
                }
              }}
            >
              <div className={`day-card-header ${isToday ? 'today-header' : ''}`}>
                <div className="day-card-title">
                  <span className="day-name">{day.dayName}</span>
                  <span className="day-date">{day.monthName} {day.dayNum}</span>
                </div>
                <span
                  className={`route-status-indicator ${routeStatus}`}
                  aria-label={`Route status: ${routeStatus}`}
                />
              </div>

              <div className="day-card-body">
                <div className="day-stops-count">
                  {dayStops.length} {dayStops.length === 1 ? 'stop' : 'stops'}
                </div>

                {dayStops.length > 0 && (
                  <div className="day-stops-list">
                    {dayStops.slice(0, 4).map((stop) => (
                      <div key={stop.id} className="day-stop-item">
                        <span className="stop-number">#{stop.stopNumber || '?'}</span>
                        <span className="stop-address" title={stop.address}>
                          {stop.address.length > 30
                            ? `${stop.address.substring(0, 30)}...`
                            : stop.address}
                        </span>
                        <span className="stop-location-tag">
                          {stop.zip || stop.city}
                        </span>
                      </div>
                    ))}
                    {dayStops.length > 4 && (
                      <div className="day-stops-more">
                        +{dayStops.length - 4} more
                      </div>
                    )}
                  </div>
                )}

                {route && (
                  <div className="day-route-stats">
                    <div className="route-stat">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                      <span>{formatDistance(route.distance)}</span>
                    </div>
                    <div className="route-stat">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      <span>{formatDuration(route.duration)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Duplicate Area Warnings Panel */}
      <div className="duplicate-warnings-panel">
        <h3 className="warnings-title">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Duplicate Area Analysis
        </h3>

        {duplicateWarnings.length === 0 ? (
          <div className="no-warnings-message">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            No duplicate areas detected this week
          </div>
        ) : (
          <div className="warnings-list">
            {duplicateWarnings.map((warning, index) => (
              <div key={index} className="warning-item">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="warning-icon">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="warning-content">
                  <span className="warning-area">{warning.area}</span>
                  <span className="warning-text">
                    was visited on {warning.days.map((d, i) => {
                      const dayObj = weekDays.find(wd => wd.date === d);
                      const dayName = dayObj ? dayObj.dayName : d;
                      return i === warning.days.length - 1
                        ? dayName
                        : `${dayName}, `;
                    })} - consider consolidating
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Week Summary Stats */}
      <div className="week-summary">
        <h3 className="summary-title">Week Summary</h3>
        <div className="summary-stats-grid">
          <div className="summary-stat">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{weekStats.totalStops}</div>
              <div className="stat-label">Total Stops</div>
            </div>
          </div>

          <div className="summary-stat">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{formatDistance(weekStats.totalDistance)}</div>
              <div className="stat-label">Total Distance</div>
            </div>
          </div>

          <div className="summary-stat">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{formatDuration(weekStats.totalDuration)}</div>
              <div className="stat-label">Total Duration</div>
            </div>
          </div>

          <div className="summary-stat">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{weekStats.duplicateCount}</div>
              <div className="stat-label">Duplicate Areas</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
