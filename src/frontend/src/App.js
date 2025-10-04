import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, FileText, Database, Link2, CheckCircle, Loader } from 'lucide-react';

const HexGrid = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [paperId, setPaperId] = useState('');
  const [kValue, setKValue] = useState(5);
  const [loading, setLoading] = useState(false);
  const [activeHexagons, setActiveHexagons] = useState([]);
  const [connections, setConnections] = useState([]);
  const [papers, setPapers] = useState([]);
  const [gridOffset, setGridOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [autoScroll, setAutoScroll] = useState(true);
  const [hoveredHex, setHoveredHex] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const animationRef = useRef(null);

  // Hexagon dimensions
  const hexSize = 60;
  const hexWidth = hexSize * Math.sqrt(3);
  const hexHeight = hexSize * 2;
  const vertDist = hexHeight * 0.75;

  // Update viewport size on resize
  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Create hexagon path (flat-top orientation for honeycomb)
  const createHexPath = (x, y, size) => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6; // Rotate 30 degrees for flat-top
      points.push([
        x + size * Math.cos(angle),
        y + size * Math.sin(angle)
      ]);
    }
    return points.map(p => p.join(',')).join(' ');
  };

  // Generate visible hexagons dynamically based on viewport and offset
  const generateVisibleGrid = () => {
    const hexagons = [];
    const centerX = viewportSize.width / 2;
    const centerY = viewportSize.height / 2;
    
    // Calculate how many hexagons we need to fill the viewport with buffer
    const colsNeeded = Math.ceil(viewportSize.width / hexWidth) + 4;
    const rowsNeeded = Math.ceil(viewportSize.height / vertDist) + 4;
    
    // Calculate which hexagons are visible based on current offset
    const offsetCol = Math.floor(-gridOffset.x / hexWidth);
    const offsetRow = Math.floor(-gridOffset.y / vertDist);
    
    for (let row = offsetRow - rowsNeeded; row <= offsetRow + rowsNeeded; row++) {
      for (let col = offsetCol - colsNeeded; col <= offsetCol + colsNeeded; col++) {
        const x = col * hexWidth + (row % 2) * (hexWidth / 2);
        const y = row * vertDist;
        hexagons.push({ 
          x, 
          y, 
          col, 
          row,
          id: `${col}-${row}` 
        });
      }
    }
    return hexagons;
  };

  const visibleHexagons = generateVisibleGrid();

  // Animate grid panning
  useEffect(() => {
    if (!autoScroll) return;
    
    let animationFrame;
    let time = 0;
    
    const animate = () => {
      time += 0.0003;
      setGridOffset({
        x: Math.sin(time) * 20,
        y: Math.cos(time * 0.7) * 15
      });
      animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [autoScroll]);

  // Handle mouse/touch drag
  const handlePointerDown = (e) => {
    setIsDragging(true);
    setAutoScroll(false);
    setDragStart({
      x: e.clientX - gridOffset.x,
      y: e.clientY - gridOffset.y
    });
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    setGridOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const step = e.shiftKey ? 50 : 20;
      setAutoScroll(false);
      
      switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          setGridOffset(prev => ({ ...prev, y: prev.y + step }));
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          setGridOffset(prev => ({ ...prev, y: prev.y - step }));
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          setGridOffset(prev => ({ ...prev, x: prev.x + step }));
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          setGridOffset(prev => ({ ...prev, x: prev.x - step }));
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setGridOffset({ x: 0, y: 0 });
          setAutoScroll(true);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle mouse wheel zoom/pan
  const handleWheel = (e) => {
    e.preventDefault();
    setAutoScroll(false);
    
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    
    setGridOffset(prev => ({
      x: prev.x - e.deltaX * 0.5,
      y: prev.y - e.deltaY * 0.5
    }));
  };

  // Mock API call
  const handleSubmit = async () => {
    if (!paperId) return;
    
    setLoading(true);
    setModalOpen(false);
    
    // Select random hexagons near center
    const nearby = visibleHexagons
      .map((hex) => ({
        ...hex,
        dist: Math.sqrt(Math.pow(hex.x, 2) + Math.pow(hex.y, 2))
      }))
      .filter(h => h.dist > hexWidth && h.dist < 400)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, Math.min(kValue, 12));
    
    // Animate hexagons turning yellow
    for (let i = 0; i < nearby.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      setActiveHexagons(prev => [...prev, nearby[i]]);
    }
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate mock paper data
    const mockPapers = nearby.map((hex, idx) => ({
      id: `paper-${idx}`,
      title: `Related Paper ${idx + 1}: Deep Learning Reproducibility Study`,
      score: Math.floor(Math.random() * 30 + 70),
      dataAvailable: Math.random() > 0.3,
      codeAvailable: Math.random() > 0.4,
      replications: Math.floor(Math.random() * 15 + 1),
      hex
    }));
    
    setPapers(mockPapers);
    setConnections(nearby);
    setLoading(false);
  };

  const handleReset = () => {
    setActiveHexagons([]);
    setConnections([]);
    setPapers([]);
    setPaperId('');
    setKValue(5);
  };

  const isCenterHex = (hex) => {
    return hex.col === 0 && hex.row === 0;
  };

  const isActiveHex = (hex) => {
    return activeHexagons.find(h => h.id === hex.id);
  };

  const getHexColor = (hex) => {
    if (isCenterHex(hex)) return '#ffcc00';
    if (isActiveHex(hex)) return '#ffcc00';
    return '#ffffff';
  };

  const getHexStroke = (hex) => {
    if (isCenterHex(hex)) return '#f59e0b';
    if (isActiveHex(hex)) return '#f59e0b';
    return '#d1d5db';
  };

  return (
    <div 
      className="relative w-full h-screen bg-gray-50 overflow-hidden"
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onWheel={handleWheel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-white shadow-sm pointer-events-none">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Reproducibility Checker</h1>
            <p className="text-sm text-gray-600 mt-1">Verify scientific rigor in ML research</p>
          </div>
          {papers.length > 0 && (
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors pointer-events-auto"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Navigation Help */}
      <div className="absolute bottom-4 right-4 z-20 bg-white rounded-lg shadow-lg p-4 text-xs text-gray-600 pointer-events-none">
        <div className="font-semibold text-gray-900 mb-2">Navigation</div>
        <div className="space-y-1">
          <div>🖱️ <strong>Click & Drag</strong> to pan</div>
          <div>⌨️ <strong>Arrow Keys / WASD</strong> to move</div>
          <div>🖱️ <strong>Scroll</strong> to pan smoothly</div>
          <div>⌨️ <strong>R</strong> to recenter & resume auto-scroll</div>
          <div>⌨️ <strong>Shift</strong> for faster movement</div>
        </div>
      </div>

      {/* Hexagon Grid */}
      <svg className="w-full h-full pointer-events-none">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="0" dy="1" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.15"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <g transform={`translate(${viewportSize.width / 2 + gridOffset.x}, ${viewportSize.height / 2 + gridOffset.y})`}>
          {/* Connection Lines */}
          {connections.map((hex, idx) => (
            <line
              key={`line-${hex.id}`}
              x1="0"
              y1="0"
              x2={hex.x}
              y2={hex.y}
              stroke="#fbbf24"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.6"
              style={{
                animation: `drawLine 0.5s ease-out ${idx * 0.1}s forwards`,
                strokeDashoffset: 1000
              }}
            />
          ))}
          
          {/* Hexagons */}
          {visibleHexagons.map((hex) => {
            const isCenter = isCenterHex(hex);
            const isActive = isActiveHex(hex);
            const isHovered = hoveredHex === hex.id;
            
            return (
              <g 
                key={hex.id} 
                transform={`translate(${hex.x}, ${hex.y})`}
                className="pointer-events-auto"
                onMouseEnter={() => setHoveredHex(hex.id)}
                onMouseLeave={() => setHoveredHex(null)}
              >
                <polygon
                  points={createHexPath(0, 0, hexSize)}
                  fill={getHexColor(hex)}
                  stroke={getHexStroke(hex)}
                  strokeWidth="1.5"
                  filter="url(#shadow)"
                  className="transition-all duration-200"
                  onClick={isCenter ? () => setModalOpen(true) : undefined}
                  onMouseDown={(e) => isCenter && e.stopPropagation()}
                  style={{
                    transform: isHovered && !isActive ? 'scale(1.05)' : 'scale(1)',
                    transformOrigin: 'center',
                    cursor: isCenter ? 'pointer' : 'inherit',
                    animation: isActive ? 'rotateHex 0.6s ease-out' : 'none'
                  }}
                />
                {isCenter && (
                  <g transform="translate(-16, -16)" className="pointer-events-none">
                    <Plus size={32} stroke="#f59e0b" strokeWidth={2.5} />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Loading Indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 z-30 pointer-events-auto">
          <div className="bg-white rounded-lg p-8 shadow-2xl flex flex-col items-center">
            <Loader className="animate-spin text-yellow-500" size={48} />
            <p className="mt-4 text-gray-700 font-medium">Analyzing paper reproducibility...</p>
          </div>
        </div>
      )}

      {/* Paper Cards */}
      {papers.map((paper, idx) => {
        const screenX = viewportSize.width / 2 + paper.hex.x + gridOffset.x;
        const screenY = viewportSize.height / 2 + paper.hex.y + gridOffset.y;
        const cardOffset = idx % 2 === 0 ? 80 : -80;
        
        return (
          <div
            key={paper.id}
            className="absolute bg-white rounded-lg shadow-lg p-4 w-64 z-10 pointer-events-auto"
            style={{
              left: screenX + cardOffset,
              top: screenY - 60,
              animation: `fadeIn 0.5s ease-out ${idx * 0.1}s forwards`,
              opacity: 0
            }}
          >
            <h3 className="font-semibold text-sm text-gray-900 mb-2 line-clamp-2">
              {paper.title}
            </h3>
            
            <div className="flex items-center mb-3">
              <div className="text-2xl font-bold text-yellow-600">{paper.score}%</div>
              <div className="ml-2 text-xs text-gray-600">Reproducibility Score</div>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-700">
                  <Database size={14} className="mr-1.5" />
                  <span>Dataset</span>
                </div>
                {paper.dataAvailable ? (
                  <CheckCircle size={14} className="text-green-500" />
                ) : (
                  <X size={14} className="text-red-400" />
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-700">
                  <FileText size={14} className="mr-1.5" />
                  <span>Code</span>
                </div>
                {paper.codeAvailable ? (
                  <CheckCircle size={14} className="text-green-500" />
                ) : (
                  <X size={14} className="text-red-400" />
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-700">
                  <Link2 size={14} className="mr-1.5" />
                  <span>Replications</span>
                </div>
                <span className="font-semibold text-gray-900">{paper.replications}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Modal */}
      {modalOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 z-40 pointer-events-auto">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Enter Paper Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paper ID (e.g., arXiv:2103.xxxxx)
                </label>
                <input
                  type="text"
                  value={paperId}
                  onChange={(e) => setPaperId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                  placeholder="arXiv:2103.12345"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of related papers (k = {kValue})
                </label>
                <input
                  type="range"
                  min="3"
                  max="12"
                  value={kValue}
                  onChange={(e) => setKValue(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 rounded-lg font-medium text-white transition-colors"
              >
                Analyze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes rotateHex {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1); }
          100% { transform: rotate(360deg) scale(1); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes drawLine {
          to { strokeDashoffset: 0; }
        }
        
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default HexGrid;