import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

/** Format a local Date as YYYY-MM-DD (avoids UTC shift from toISOString) */
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const useRouteStore = create(
  persist(
    (set, get) => ({
      // API Settings
      orsApiKey: '',
      setOrsApiKey: (key) => set({ orsApiKey: key }),

      // Active view: 'planner' | 'week'
      activeView: 'planner',
      setActiveView: (view) => set({ activeView: view }),

      // Current day for week view (ISO date string)
      activeDay: toLocalDateStr(new Date()),
      setActiveDay: (day) => set({ activeDay: day }),

      // Week start date (Monday of current week)
      weekStartDate: (() => {
        const d = new Date();
        const dow = d.getDay();
        const diff = d.getDate() - dow + (dow === 0 ? -6 : 1);
        const monday = new Date(d.getFullYear(), d.getMonth(), diff);
        return toLocalDateStr(monday);
      })(),
      setWeekStartDate: (date) => set({ weekStartDate: date }),

      // Stops: { id, address, lat, lng, city, state, zip, caseNumber, surveyType, stopNumber, dayDate }
      stops: [],

      addStop: (stop) => {
        const id = uuidv4();
        set((state) => ({
          stops: [...state.stops, {
            id,
            address: stop.address || '',
            lat: stop.lat || null,
            lng: stop.lng || null,
            city: stop.city || '',
            state: stop.state || '',
            zip: stop.zip || '',
            caseNumber: stop.caseNumber || '',
            surveyType: stop.surveyType || '',
            stopNumber: state.stops.filter(s => s.dayDate === (stop.dayDate || state.activeDay)).length + 1,
            dayDate: stop.dayDate || state.activeDay,
            isHomeAddress: stop.isHomeAddress || false,
            actualMileage: stop.actualMileage ?? null,
            estimatedMileage: stop.estimatedMileage ?? null,
            mileageFlag: stop.mileageFlag || false,
          }]
        }));
        return id;
      },

      updateStop: (id, updates) => set((state) => ({
        stops: state.stops.map(s => s.id === id ? { ...s, ...updates } : s)
      })),

      removeStop: (id) => set((state) => ({
        stops: state.stops.filter(s => s.id !== id)
      })),

      reorderStops: (dayDate, newOrder) => set((state) => {
        const otherStops = state.stops.filter(s => s.dayDate !== dayDate);
        const reordered = newOrder.map((id, idx) => {
          const stop = state.stops.find(s => s.id === id);
          return { ...stop, stopNumber: idx + 1 };
        });
        return { stops: [...otherStops, ...reordered] };
      }),

      clearStops: (dayDate) => set((state) => ({
        stops: dayDate
          ? state.stops.filter(s => s.dayDate !== dayDate)
          : []
      })),

      // Get stops for a specific day, sorted by stopNumber
      getStopsForDay: (dayDate) => {
        const day = dayDate || get().activeDay;
        return get().stops
          .filter(s => s.dayDate === day)
          .sort((a, b) => a.stopNumber - b.stopNumber);
      },

      // Routes: { dayDate: { original: {geometry, distance, duration}, optimized: {geometry, distance, duration, newOrder} } }
      routes: {},

      setRoute: (dayDate, type, routeData) => set((state) => ({
        routes: {
          ...state.routes,
          [dayDate]: {
            ...state.routes[dayDate],
            [type]: routeData
          }
        }
      })),

      clearRoute: (dayDate) => set((state) => {
        const newRoutes = { ...state.routes };
        delete newRoutes[dayDate];
        return { routes: newRoutes };
      }),

      // Reset everything (for switching reps)
      resetAll: () => set({
        stops: [],
        routes: {},
        showComparison: false,
        error: null,
      }),

      // Comparison mode
      showComparison: false,
      setShowComparison: (show) => set({ showComparison: show }),

      // Loading states
      isCalculating: false,
      setIsCalculating: (val) => set({ isCalculating: val }),
      isOptimizing: false,
      setIsOptimizing: (val) => set({ isOptimizing: val }),
      isGeocoding: false,
      setIsGeocoding: (val) => set({ isGeocoding: val }),

      // Error state
      error: null,
      setError: (err) => set({ error: err }),
      clearError: () => set({ error: null }),

      // Open cases from Excel import
      openCases: [],         // all parsed cases matching survey types
      openCasesFRNames: [],  // unique FR names from the file
      selectedFR: null,      // currently selected FR name to highlight
      showOpenCases: true,   // whether to show open case pins on map
      setOpenCases: (cases, frNames) => set({ openCases: cases, openCasesFRNames: frNames }),
      setSelectedFR: (fr) => set({ selectedFR: fr }),
      setShowOpenCases: (show) => set({ showOpenCases: show }),
      clearOpenCases: () => set({ openCases: [], openCasesFRNames: [], selectedFR: null }),

      // Settings panel
      showSettings: false,
      setShowSettings: (show) => set({ showSettings: show }),
    }),
    {
      name: 'mueller-route-optimizer',
      partialize: (state) => ({
        orsApiKey: state.orsApiKey,
        stops: state.stops,
        routes: state.routes,
        weekStartDate: state.weekStartDate,
      }),
    }
  )
);

export default useRouteStore;
