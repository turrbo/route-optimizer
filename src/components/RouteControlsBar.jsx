import React from 'react';
import useRouteStore from '../store/routeStore';
import { calculateRoute, optimizeRoute, formatDistance, formatDuration } from '../utils/routing';
import './RouteControlsBar.css';

export default function RouteControlsBar() {
  const {
    getStopsForDay,
    reorderStops,
    activeDay,
    routes,
    showComparison,
    setShowComparison,
    isCalculating,
    isOptimizing,
    setIsCalculating,
    setIsOptimizing,
    setRoute,
    orsApiKey,
    setError,
    clearError,
    stops: allStops,
  } = useRouteStore();

  const stops = getStopsForDay(activeDay);
  const dayRoutes = routes[activeDay] || { original: null, optimized: null };

  // Build route-ready stop list: home first, stops in order, home last
  const buildRouteStops = (stopsArr) => {
    const homeStop = stopsArr.find(s => s.isHomeAddress);
    const nonHome = stopsArr.filter(s => !s.isHomeAddress);
    if (homeStop) {
      return [homeStop, ...nonHome, { ...homeStop, id: homeStop.id + '-return' }];
    }
    return stopsArr;
  };

  const handleCalculateRoute = async () => {
    if (stops.length < 2) return;
    setIsCalculating(true);
    clearError();
    try {
      const routeStops = buildRouteStops(stops);
      const routeData = await calculateRoute(routeStops, orsApiKey);
      setRoute(activeDay, 'original', routeData);
    } catch (error) {
      console.error('Route calculation error:', error);
      setError(error.message || 'Route calculation failed.');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleOptimizeRoute = async () => {
    if (stops.length < 3) return;
    setIsOptimizing(true);
    clearError();
    try {
      const routeStops = buildRouteStops(stops);
      const optimizedData = await optimizeRoute(routeStops, orsApiKey);
      setRoute(activeDay, 'optimized', optimizedData);
      if (optimizedData.optimizedOrder) {
        const realIds = optimizedData.optimizedOrder.filter(id => !id.endsWith('-return'));
        reorderStops(activeDay, realIds);
      }
    } catch (error) {
      console.error('Route optimization error:', error);
      setError(error.message || 'Route optimization failed.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const canCalculateRoute = stops.length >= 2 && !isCalculating;
  const canOptimizeRoute = stops.length >= 3 && !isOptimizing;
  const canCompareRoutes = dayRoutes.original && dayRoutes.optimized;
  const hasStats = dayRoutes.original || dayRoutes.optimized;

  return (
    <div className="rc-bar">
      <div className="rc-bar-inner">
        <div className="rc-buttons">
          <button
            className="rc-btn rc-btn-calc"
            onClick={handleCalculateRoute}
            disabled={!canCalculateRoute}
          >
            {isCalculating ? 'Calculating...' : 'Calculate Route'}
          </button>
          <button
            className="rc-btn rc-btn-opt"
            onClick={handleOptimizeRoute}
            disabled={!canOptimizeRoute}
          >
            {isOptimizing ? 'Optimizing...' : 'Optimize Route'}
          </button>
          {canCompareRoutes && (
            <button
              className={`rc-btn rc-btn-compare ${showComparison ? 'active' : ''}`}
              onClick={() => setShowComparison(!showComparison)}
            >
              {showComparison ? 'Hide Comparison' : 'Compare'}
            </button>
          )}
        </div>

        {hasStats && (
          <div className="rc-stats">
            {dayRoutes.original && (
              <div className="rc-stat">
                <span className="rc-stat-label">Original:</span>
                <span className="rc-stat-value">{formatDistance(dayRoutes.original.distance)}</span>
                <span className="rc-stat-sep">/</span>
                <span className="rc-stat-value">{formatDuration(dayRoutes.original.duration)}</span>
              </div>
            )}
            {dayRoutes.optimized && (
              <div className="rc-stat rc-stat-opt">
                <span className="rc-stat-label">Optimized:</span>
                <span className="rc-stat-value">{formatDistance(dayRoutes.optimized.distance)}</span>
                <span className="rc-stat-sep">/</span>
                <span className="rc-stat-value">{formatDuration(dayRoutes.optimized.duration)}</span>
                {dayRoutes.original && (
                  <span className="rc-savings">
                    Saves {formatDistance(dayRoutes.original.distance - dayRoutes.optimized.distance)},
                    {' '}{formatDuration(dayRoutes.original.duration - dayRoutes.optimized.duration)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
