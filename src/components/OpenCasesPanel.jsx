import React, { useState, useEffect, useRef, useMemo } from 'react';
import useRouteStore from '../store/routeStore';
import { parseOpenCasesExcel, filterOpenCases } from '../utils/excelParser';
import { geocodeAddress } from '../utils/geocoding';
import './OpenCasesPanel.css';

// In-memory geocode cache keyed by "address, city, state"
const geocodeCache = {};
let geocodeAbort = false;

async function geocodeCases(cases, geocodeCaseFn) {
  geocodeAbort = true; // cancel any previous run
  await new Promise(r => setTimeout(r, 50)); // let previous loop exit
  geocodeAbort = false;

  for (const c of cases) {
    if (geocodeAbort) return;
    const key = `${c.address}, ${c.city}, ${c.state}`;

    // Already geocoded in store
    if (c.lat && c.lng) continue;

    // Check cache
    if (geocodeCache[key]) {
      if (geocodeCache[key].lat) {
        geocodeCaseFn(c.controlNumber, geocodeCache[key].lat, geocodeCache[key].lng);
      }
      continue;
    }

    try {
      const geo = await geocodeAddress(key);
      geocodeCache[key] = { lat: geo.lat, lng: geo.lng };
      if (!geocodeAbort) {
        geocodeCaseFn(c.controlNumber, geo.lat, geo.lng);
      }
    } catch {
      geocodeCache[key] = { lat: null, lng: null };
    }
  }
}

export default function OpenCasesBar() {
  const activeDay = useRouteStore(s => s.activeDay);
  const openCases = useRouteStore(s => s.openCases);
  const openCasesFRNames = useRouteStore(s => s.openCasesFRNames);
  const selectedFR = useRouteStore(s => s.selectedFR);
  const showOpenCases = useRouteStore(s => s.showOpenCases);
  const setOpenCases = useRouteStore(s => s.setOpenCases);
  const setSelectedFR = useRouteStore(s => s.setSelectedFR);
  const setShowOpenCases = useRouteStore(s => s.setShowOpenCases);
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
    return () => { geocodeAbort = true; };
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

        <div className="oc-bar-counts">
          <span className="oc-dot oc-dot-green"></span>
          <span>{unassignedCases.length} unassigned</span>
        </div>

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
