import React, { useState, useMemo, useRef } from 'react';
import useRouteStore from '../store/routeStore';
import { parseOpenCasesExcel, filterOpenCases } from '../utils/excelParser';
import { geocodeAddress } from '../utils/geocoding';
import './OpenCasesPanel.css';

export default function OpenCasesPanel() {
  const activeDay = useRouteStore(s => s.activeDay);
  const openCases = useRouteStore(s => s.openCases);
  const openCasesFRNames = useRouteStore(s => s.openCasesFRNames);
  const selectedFR = useRouteStore(s => s.selectedFR);
  const showOpenCases = useRouteStore(s => s.showOpenCases);
  const setOpenCases = useRouteStore(s => s.setOpenCases);
  const setSelectedFR = useRouteStore(s => s.setSelectedFR);
  const setShowOpenCases = useRouteStore(s => s.setShowOpenCases);
  const clearOpenCases = useRouteStore(s => s.clearOpenCases);
  const setError = useRouteStore(s => s.setError);

  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [geocodingProgress, setGeocodingProgress] = useState(null);
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
        setError('No matching cases found in the file. Check that it has the expected survey types.');
        setIsLoading(false);
        return;
      }

      // Geocode all cases sequentially (Nominatim 1 req/sec)
      setGeocodingProgress({ done: 0, total: cases.length });
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const query = `${c.address}, ${c.city}, ${c.state}`;
        try {
          const geo = await geocodeAddress(query);
          c.lat = geo.lat;
          c.lng = geo.lng;
        } catch {
          // leave lat/lng as undefined - won't show on map
        }
        setGeocodingProgress({ done: i + 1, total: cases.length });
      }
      setGeocodingProgress(null);

      setOpenCases(cases, frNames);
    } catch (err) {
      console.error('Excel parse error:', err);
      setError('Failed to parse Excel file. Make sure it is a valid .xlsx file.');
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

  const handleClear = () => {
    clearOpenCases();
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="open-cases-panel">
      <h2 className="section-title">Open Cases</h2>

      {/* File Upload */}
      <div className="oc-upload-area">
        <label className="oc-upload-btn">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={isLoading}
            hidden
          />
          {isLoading ? 'Processing...' : 'Upload Excel File'}
        </label>
        {fileName && (
          <span className="oc-file-name" title={fileName}>
            {fileName.length > 25 ? fileName.substring(0, 25) + '...' : fileName}
          </span>
        )}
      </div>

      {geocodingProgress && (
        <div className="oc-geocoding-bar">
          Geocoding {geocodingProgress.done} / {geocodingProgress.total}
          <div className="oc-progress-track">
            <div
              className="oc-progress-fill"
              style={{ width: `${(geocodingProgress.done / geocodingProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {openCases.length > 0 && (
        <>
          {/* FR Selector */}
          <div className="oc-fr-selector">
            <label htmlFor="fr-select">Field Rep</label>
            <select
              id="fr-select"
              value={selectedFR || ''}
              onChange={(e) => setSelectedFR(e.target.value || null)}
            >
              <option value="">-- None --</option>
              {openCasesFRNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Toggle visibility */}
          <label className="oc-toggle">
            <input
              type="checkbox"
              checked={showOpenCases}
              onChange={(e) => setShowOpenCases(e.target.checked)}
            />
            Show on map
          </label>

          {/* Summary */}
          <div className="oc-summary">
            <div className="oc-stat">
              <span className="oc-dot oc-dot-green"></span>
              Unassigned: <strong>{unassignedCases.length}</strong>
            </div>
            {selectedFR && (
              <div className="oc-stat">
                <span className="oc-dot oc-dot-blue"></span>
                {selectedFR.split(' ')[0]}: <strong>{assignedCases.length}</strong>
              </div>
            )}
            <div className="oc-stat oc-stat-total">
              Total matched: {filteredCases.length} of {openCases.length}
            </div>
          </div>

          {/* Case list */}
          <div className="oc-case-list">
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
          </div>

          <button className="btn btn-secondary oc-clear-btn" onClick={handleClear}>
            Clear Cases
          </button>
        </>
      )}
    </div>
  );
}
