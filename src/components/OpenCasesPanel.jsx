import React, { useState, useEffect, useRef, useMemo } from 'react';
import useRouteStore from '../store/routeStore';
import { parseOpenCasesExcel, filterOpenCases } from '../utils/excelParser';
import { geocodeAddress } from '../utils/geocoding';
import './OpenCasesPanel.css';

// In-memory geocode cache keyed by "address, city, state"
// Successful results are cached permanently; failures are NOT cached so they can be retried
const geocodeCache = {};
let geocodeAbortController = null;

const BATCH_CONCURRENCY = 3; // geocode 3 cases at a time

async function geocodeCases(cases, geocodeCaseFn) {
  // Cancel any previous run
  if (geocodeAbortController) {
    geocodeAbortController.abort();
  }
  const controller = new AbortController();
  geocodeAbortController = controller;

  // Small delay to let the previous loop exit cleanly
  await new Promise(r => setTimeout(r, 50));
  if (controller.signal.aborted) return;

  // Filter to only cases that need geocoding
  const pending = cases.filter(c => {
    if (c.lat && c.lng) return false;
    const key = `${c.address}, ${c.city}, ${c.state}`;
    if (geocodeCache[key]) {
      // Apply cached result immediately
      geocodeCaseFn(c.controlNumber, geocodeCache[key].lat, geocodeCache[key].lng);
      return false;
    }
    return true;
  });

  // Process in concurrent batches
  for (let i = 0; i < pending.length; i += BATCH_CONCURRENCY) {
    if (controller.signal.aborted) return;

    const batch = pending.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const key = `${c.address}, ${c.city}, ${c.state}`;
        const geo = await geocodeAddress(key);
        return { controlNumber: c.controlNumber, key, lat: geo.lat, lng: geo.lng };
      })
    );

    if (controller.signal.aborted) return;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { controlNumber, key, lat, lng } = result.value;
        geocodeCache[key] = { lat, lng };
        geocodeCaseFn(controlNumber, lat, lng);
      }
      // Failures are not cached - will retry on next run
    }
  }
}

export default function OpenCasesBar() {
  const activeDay = useRouteStore(s => s.activeDay);
  const openCases = useRouteStore(s => s.openCases);
  const openCasesFRNames = useRouteStore(s => s.openCasesFRNames);
  const selectedFR = useRouteStore(s => s.selectedFR);
  const showOpenCases = useRouteStore(s => s.showOpenCases);
  const showUnassigned = useRouteStore(s => s.showUnassigned);
  const setOpenCases = useRouteStore(s => s.setOpenCases);
  const setSelectedFR = useRouteStore(s => s.setSelectedFR);
  const setShowOpenCases = useRouteStore(s => s.setShowOpenCases);
  const setShowUnassigned = useRouteStore(s => s.setShowUnassigned);
  const clearOpenCases = useRouteStore(s => s.clearOpenCases);
  const geocodeCase = useRouteStore(s => s.geocodeCase);
  const setError = useRouteStore(s => s.setError);

  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState(openCases.length > 0 ? 'Open Cases (saved)' : '');
  const [showList, setShowList] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const { cases, frNames } = parseOpenCasesExcel(buffer);

      if (cases.length === 0) {
        setError('No matching cases found in the file.');
        setIsLoading(false);
        return;
      }

      // Apply cached geocode results immediately
      for (const c of cases) {
        const key = `${c.address}, ${c.city}, ${c.state}`;
        if (geocodeCache[key] && geocodeCache[key].lat) {
          c.lat = geocodeCache[key].lat;
          c.lng = geocodeCache[key].lng;
        }
      }

      setOpenCases(cases, frNames);
    } catch (err) {
      console.error('Excel parse error:', err);
      setError('Failed to parse Excel file.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter cases by route date
  const filteredCases = useMemo(() => {
    if (openCases.length === 0) return [];
    return filterOpenCases(openCases, activeDay);
  }, [openCases, activeDay]);

  const unassignedCases = useMemo(
    () => filteredCases.filter(c => !c.frAssigned),
    [filteredCases]
  );

  const assignedCases = useMemo(
    () => selectedFR ? filteredCases.filter(c => c.frAssigned === selectedFR) : [],
    [filteredCases, selectedFR]
  );

  // Geocode visible cases: unassigned + selected FR's assigned
  const casesToGeocode = useMemo(
    () => [...unassignedCases, ...assignedCases].filter(c => !c.lat || !c.lng),
    [unassignedCases, assignedCases]
  );

  useEffect(() => {
    if (casesToGeocode.length === 0) return;
    geocodeCases(casesToGeocode, geocodeCase);
    return () => {
      if (geocodeAbortController) geocodeAbortController.abort();
    };
  }, [casesToGeocode, geocodeCase]);

  const totalVisible = unassignedCases.length + assignedCases.length;
  const totalGeocoded = unassignedCases.filter(c => c.lat && c.lng).length +
                        assignedCases.filter(c => c.lat && c.lng).length;
  const isGeocoding = totalGeocoded < totalVisible && totalVisible > 0;

  const handleClear = () => {
    clearOpenCases();
    setFileName('');
    setShowList(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (openCases.length === 0) {
    return (
      <div className="oc-bar">
        <div className="oc-bar-inner">
          <span className="oc-bar-label">Open Cases:</span>
          <label className="oc-upload-btn">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={isLoading}
              hidden
            />
            {isLoading ? 'Processing...' : 'Upload Excel'}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="oc-bar">
      <div className="oc-bar-inner">
        <span className="oc-bar-label">Open Cases:</span>

        <label className="oc-bar-toggle">
          <input
            type="checkbox"
            checked={showUnassigned}
            onChange={(e) => setShowUnassigned(e.target.checked)}
          />
          <span className="oc-dot oc-dot-green"></span>
          {unassignedCases.length} unassigned
        </label>

        <div className="oc-bar-fr">
          <span className="oc-dot oc-dot-blue"></span>
          <select
            value={selectedFR || ''}
            onChange={(e) => setSelectedFR(e.target.value || null)}
          >
            <option value="">Select FR...</option>
            {openCasesFRNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {selectedFR && <span className="oc-bar-fr-count">{assignedCases.length}</span>}
        </div>

        {isGeocoding && (
          <span className="oc-bar-geocoding">
            Mapping {totalGeocoded}/{totalVisible}
          </span>
        )}

        <label className="oc-bar-toggle">
          <input
            type="checkbox"
            checked={showOpenCases}
            onChange={(e) => setShowOpenCases(e.target.checked)}
          />
          Map
        </label>

        <button className="oc-bar-list-btn" onClick={() => setShowList(!showList)}>
          {showList ? 'Hide List' : 'List'}
        </button>

        <label className="oc-upload-btn oc-upload-btn-small">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={isLoading}
            hidden
          />
          Re-upload
        </label>

        <button className="oc-bar-clear" onClick={handleClear} title="Clear open cases">
          x
        </button>
      </div>

      {showList && (
        <div className="oc-list-dropdown">
          {unassignedCases.length > 0 && (
            <div className="oc-group">
              <div className="oc-group-header oc-group-unassigned">
                Unassigned ({unassignedCases.length})
              </div>
              {unassignedCases.map(c => (
                <div key={c.controlNumber} className="oc-case-item">
                  <div className="oc-case-address">{c.address}, {c.city}, {c.state}</div>
                  <div className="oc-case-meta">
                    <span>#{c.controlNumber}</span>
                    <span>{c.surveyType}</span>
                    <span>Ordered: {c.dateOrdered}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {assignedCases.length > 0 && (
            <div className="oc-group">
              <div className="oc-group-header oc-group-assigned">
                {selectedFR} ({assignedCases.length})
              </div>
              {assignedCases.map(c => (
                <div key={c.controlNumber} className="oc-case-item">
                  <div className="oc-case-address">{c.address}, {c.city}, {c.state}</div>
                  <div className="oc-case-meta">
                    <span>#{c.controlNumber}</span>
                    <span>{c.surveyType}</span>
                    <span>Ordered: {c.dateOrdered}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {unassignedCases.length === 0 && assignedCases.length === 0 && (
            <div className="oc-empty">No matching cases for this date.</div>
          )}
        </div>
      )}
    </div>
  );
}
