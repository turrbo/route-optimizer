import React, { useMemo, useRef, useCallback, useState } from 'react';
import useRouteStore from '../store/routeStore';
import { detectDuplicateAreas, formatDistance, formatDuration, haversine } from '../utils/routing';
import { filterOpenCases } from '../utils/excelParser';
import './WeekView.css';

const NEARBY_RADIUS_METERS = 32187; // 20 miles

/**
 * Parse YYYY-MM-DD string as local date (not UTC)
 */
const parseLocalDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Format a local Date as YYYY-MM-DD
 */
const formatDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Generate array of 7 dates (Mon-Fri + Sat-Sun) from a start date
 */
const getWeekDays = (startDateStr) => {
  const startDate = parseLocalDate(startDateStr);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dow = date.getDay();
    days.push({
      date: formatDateStr(date),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: date.getDate(),
      monthName: date.toLocaleDateString('en-US', { month: 'short' }),
      isWeekend: dow === 0 || dow === 6
    });
  }

  return days;
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayStr = () => {
  return formatDateStr(new Date());
};

/**
 * Get the Monday of the current week
 */
const getMondayOfWeek = (dateStr) => {
  const date = parseLocalDate(dateStr);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return formatDateStr(monday);
};

/**
 * Navigate to previous/next week
 */
const navigateWeek = (currentStart, direction) => {
  const date = parseLocalDate(currentStart);
  date.setDate(date.getDate() + (direction * 7));
  return formatDateStr(date);
};

export const WeekView = () => {
  const {
    stops,
    activeDay,
    setActiveDay,
    setActiveView,
    weekStartDate,
    setWeekStartDate,
    routes,
    openCases,
    selectedFR
  } = useRouteStore();

  const weekViewRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

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

  // Find missed opportunities: open cases near the route that could have been added
  const missedOpportunities = useMemo(() => {
    if (openCases.length === 0) return [];

    const opportunities = [];

    weekDays.forEach(day => {
      const dayStops = stopsByDay[day.date].filter(s => !s.isHomeAddress && s.lat && s.lng);
      if (dayStops.length === 0) return;

      // Get open cases available on this date
      const availableCases = filterOpenCases(openCases, day.date)
        .filter(c => c.lat && c.lng);

      // Get unassigned exterior cases near any stop
      const nearbyCases = availableCases.filter(c => {
        // Skip cases that are already in the route as stops
        const alreadyInRoute = stops.some(s => s.caseNumber === c.controlNumber);
        if (alreadyInRoute) return false;

        // Must be unassigned OR assigned to the selected FR
        if (c.frAssigned && c.frAssigned !== selectedFR) return false;

        // Check if within radius of any stop
        return dayStops.some(stop =>
          haversine(stop.lat, stop.lng, c.lat, c.lng) <= NEARBY_RADIUS_METERS
        );
      });

      if (nearbyCases.length > 0) {
        opportunities.push({
          date: day.date,
          dayName: day.dayName,
          dayNum: day.dayNum,
          monthName: day.monthName,
          cases: nearbyCases,
        });
      }
    });

    return opportunities;
  }, [openCases, selectedFR, weekDays, stopsByDay, stops]);

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

  const handleExportImage = useCallback(async () => {
    if (!weekViewRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(weekViewRef.current, {
        backgroundColor: '#f5f5f5',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `week-view-${weekStartDate}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [weekStartDate, isExporting]);

  const handleExportPDF = useCallback(async () => {
    if (!weekViewRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(weekViewRef.current, {
        backgroundColor: '#f5f5f5',
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth, imgHeight],
      });
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`week-view-${weekStartDate}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [weekStartDate, isExporting]);

  // Format week range for header
  const weekRangeText = useMemo(() => {
    const firstDay = weekDays[0];
    const lastDay = weekDays[weekDays.length - 1];
    return `Week of ${firstDay.monthName} ${firstDay.dayNum} - ${lastDay.monthName} ${lastDay.dayNum}`;
  }, [weekDays]);

  return (
    <div className="week-view" ref={weekViewRef}>
      {/* Week Navigation Header */}
      <div className="week-header">
        <h2 className="week-title">{weekRangeText}</h2>
        <div className="week-header-actions">
          <div className="week-export-buttons">
            <button
              className="week-export-btn"
              onClick={handleExportImage}
              disabled={isExporting}
              title="Save as PNG image"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
              {isExporting ? 'Saving...' : 'Save Image'}
            </button>
            <button
              className="week-export-btn"
              onClick={handleExportPDF}
              disabled={isExporting}
              title="Save as PDF"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              {isExporting ? 'Saving...' : 'Save PDF'}
            </button>
          </div>
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
              className={`day-card ${isToday ? 'is-today' : ''} ${day.date === activeDay ? 'is-active' : ''} ${day.isWeekend ? 'is-weekend' : ''}`}
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

      {/* Missed Opportunities Panel */}
      {openCases.length > 0 && (
        <div className="missed-opportunities-panel">
          <h3 className="warnings-title">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            Missed Exterior Opportunities
            <span className="opportunities-subtitle">(within 20 miles of route)</span>
          </h3>

          {missedOpportunities.length === 0 ? (
            <div className="no-warnings-message">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              No nearby open exterior cases found this week
            </div>
          ) : (
            <div className="opportunities-list">
              {missedOpportunities.map((opp) => (
                <div key={opp.date} className="opportunity-day">
                  <div className="opportunity-day-header">
                    <span className="opportunity-day-name">{opp.dayName} {opp.monthName} {opp.dayNum}</span>
                    <span className="opportunity-count">{opp.cases.length} case{opp.cases.length > 1 ? 's' : ''} nearby</span>
                  </div>
                  <div className="opportunity-cases">
                    {opp.cases.map((c) => (
                      <div key={c.controlNumber} className="opportunity-case">
                        <div className="opportunity-case-info">
                          <span className="opportunity-case-addr">{c.address}, {c.city}</span>
                          <span className="opportunity-case-meta">
                            #{c.controlNumber} - {c.surveyType}
                            {!c.frAssigned && <span className="opp-unassigned"> (Unassigned)</span>}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
