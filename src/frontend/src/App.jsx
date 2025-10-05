import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, FileText, Database, Link2, CheckCircle, Loader } from 'lucide-react';
import './App.css';

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

  // Generate only visible hexagons within viewport bounds
  const generateVisibleGrid = () => {
    const hexagons = [];
    
    // Calculate the viewport boundaries in world coordinates
    const leftBound = -gridOffset.x - viewportSize.width / 2 - hexSize; // Small buffer of one hex size
    const rightBound = -gridOffset.x + viewportSize.width / 2 + hexSize;
    const topBound = -gridOffset.y - viewportSize.height / 2 - hexSize;
    const bottomBound = -gridOffset.y + viewportSize.height / 2 + hexSize;
    
    // Calculate the range of columns and rows to check
    const minCol = Math.floor(leftBound / hexWidth) - 1;
    const maxCol = Math.ceil(rightBound / hexWidth) + 1;
    const minRow = Math.floor(topBound / vertDist) - 1;
    const maxRow = Math.ceil(bottomBound / vertDist) + 1;
    
    // Only create hexagons that are actually visible
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * hexWidth + (row % 2) * (hexWidth / 2);
        const y = row * vertDist;
        
        // Check if this hexagon is within the visible bounds
        if (x >= leftBound && x <= rightBound && y >= topBound && y <= bottomBound) {
          hexagons.push({ 
            x, 
            y, 
            col, 
            row,
            id: `${col}-${row}` 
          });
        }
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

  // Handle mouse/touch drag with RAF for smooth updates
  const rafRef = useRef(null);
  
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
    
    // Cancel any pending animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    // Schedule update on next animation frame
    rafRef.current = requestAnimationFrame(() => {
      setGridOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't process shortcuts when modal is open (user may be typing)
      if (modalOpen) return;
      
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
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  // Handle mouse wheel zoom/pan with RAF for smooth updates
  const wheelRafRef = useRef(null);
  
  const handleWheel = (e) => {
    e.preventDefault();
    setAutoScroll(false);
    
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    
    // Cancel any pending animation frame
    if (wheelRafRef.current) {
      cancelAnimationFrame(wheelRafRef.current);
    }
    
    // Schedule update on next animation frame
    const deltaX = e.deltaX;
    const deltaY = e.deltaY;
    wheelRafRef.current = requestAnimationFrame(() => {
      setGridOffset(prev => ({
        x: prev.x - deltaX * 0.5,
        y: prev.y - deltaY * 0.5
      }));
    });
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
      className="relative bg-gray-50 overflow-hidden"
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onWheel={handleWheel}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        position: 'fixed',
        top: 0,
        left: 0
      }}
    >
      {/* Header */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        backgroundColor: 'white',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        pointerEvents: 'none'
      }}>
        <div style={{
          width: '100%',
          padding: '24px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#111827',
              margin: 0
            }}>Reproducibility Checker</h1>
            <p style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              margin: '4px 0 0 0'
            }}>Verify scientific rigor in ML research</p>
          </div>
          {papers.length > 0 && (
            <button
              onClick={handleReset}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
                pointerEvents: 'auto'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#e5e7eb'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#f3f4f6'}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Navigation Help */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        zIndex: 20,
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        padding: '16px',
        fontSize: '0.75rem',
        color: '#6b7280',
        pointerEvents: 'none'
      }}>
        <div style={{
          fontWeight: 600,
          color: '#111827',
          marginBottom: '8px'
        }}>Navigation</div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div>🖱️ <strong>Click & Drag</strong> to pan</div>
          <div>⌨️ <strong>Arrow Keys / WASD</strong> to move</div>
          <div>🖱️ <strong>Scroll</strong> to pan smoothly</div>
          <div>⌨️ <strong>R</strong> to recenter & resume auto-scroll</div>
          <div>⌨️ <strong>Shift</strong> for faster movement</div>
        </div>
      </div>

      {/* Hexagon Grid */}
      <svg style={{
        width: '100%',
        height: '100%'
      }}>
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
          
          {/* Hexagons - non-center first */}
          {visibleHexagons.filter(hex => !isCenterHex(hex)).map((hex) => {
            const isActive = isActiveHex(hex);
            
            return (
              <g
                key={hex.id}
                transform={`translate(${hex.x}, ${hex.y})`}
                className='hex-normal'
                style={{ 
                  pointerEvents: 'auto',
                  transformOrigin: 'center'
                }}
              >
                <polygon
                  points={createHexPath(0, 0, hexSize)}
                  fill={hoveredHex === hex.id && !isActive ? '#f3f4f6' : getHexColor(hex)}
                  stroke={getHexStroke(hex)}
                  strokeWidth={isActive ? "1.5" : "1"}
                  style={{
                    animation: isActive ? 'rotateHex 0.6s ease-out' : undefined,
                    transition: 'fill 0.15s ease-out'
                  }}
                  onMouseEnter={() => !isActive && setHoveredHex(hex.id)}
                  onMouseLeave={() => setHoveredHex(null)}
                />
              </g>
            );
          })}
          
          {/* Center hexagon - render last so it's on top */}
          {visibleHexagons.filter(hex => isCenterHex(hex)).map((hex) => {
            const isActive = isActiveHex(hex);
            
            return (
              <g
                key={hex.id}
                transform={`translate(${hex.x}, ${hex.y})`}
                className='hex-hover'
                onClick={() => setModalOpen(true)}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ 
                  pointerEvents: 'auto',
                  transformOrigin: 'center'
                }}
              >
                <polygon
                  points={createHexPath(0, 0, hexSize)}
                  fill={getHexColor(hex)}
                  stroke={getHexStroke(hex)}
                  strokeWidth="1.5"
                  filter="url(#shadow)"
                  style={{
                    animation: isActive ? 'rotateHex 0.6s ease-out' : undefined,
                    transition: 'fill 0.15s ease-out'
                  }}
                />
                <g transform="translate(-16, -16)" style={{ pointerEvents: 'none' }}>
                  <Plus size={32} stroke="#f59e0b" strokeWidth={2.5} />
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Loading Indicator */}
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          zIndex: 30,
          pointerEvents: 'auto'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <Loader style={{
              animation: 'spin 1s linear infinite',
              color: '#eab308',
              width: '48px',
              height: '48px'
            }} />
            <p style={{
              marginTop: '16px',
              color: '#374151',
              fontWeight: 500
            }}>Analyzing paper reproducibility...</p>
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
            style={{
              position: 'absolute',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              padding: '16px',
              width: '256px',
              zIndex: 10,
              pointerEvents: 'auto',
              left: screenX + cardOffset,
              top: screenY - 60,
              animation: `fadeIn 0.5s ease-out ${idx * 0.1}s forwards`,
              opacity: 0
            }}
          >
            <h3 style={{
              fontWeight: 600,
              fontSize: '0.875rem',
              color: '#111827',
              marginBottom: '8px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {paper.title}
            </h3>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <div style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: '#eab308'
              }}>{paper.score}%</div>
              <div style={{
                marginLeft: '8px',
                fontSize: '0.75rem',
                color: '#6b7280'
              }}>Reproducibility Score</div>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.75rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: '#374151'
                }}>
                  <Database size={14} style={{ marginRight: '6px' }} />
                  <span>Dataset</span>
                </div>
                {paper.dataAvailable ? (
                  <CheckCircle size={14} style={{ color: '#10b981' }} />
                ) : (
                  <X size={14} style={{ color: '#f87171' }} />
                )}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: '#374151'
                }}>
                  <FileText size={14} style={{ marginRight: '6px' }} />
                  <span>Code</span>
                </div>
                {paper.codeAvailable ? (
                  <CheckCircle size={14} style={{ color: '#10b981' }} />
                ) : (
                  <X size={14} style={{ color: '#f87171' }} />
                )}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: '#374151'
                }}>
                  <Link2 size={14} style={{ marginRight: '6px' }} />
                  <span>Replications</span>
                </div>
                <span style={{
                  fontWeight: 600,
                  color: '#111827'
                }}>{paper.replications}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Modal */}
      {modalOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 40,
          pointerEvents: 'auto'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            padding: '32px',
            maxWidth: '448px',
            width: '100%',
            margin: '16px'
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '16px'
            }}>Enter Paper Details</h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Paper ID (e.g., arXiv:2103.xxxxx)
                </label>
                <input
                  type="text"
                  value={paperId}
                  onChange={(e) => setPaperId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.15s, ring 0.15s'
                  }}
                  placeholder="arXiv:2103.12345"
                  onFocus={(e) => {
                    e.target.style.borderColor = '#eab308';
                    e.target.style.boxShadow = '0 0 0 2px rgba(234, 179, 8, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Number of related papers (k = {kValue})
                </label>
                <input
                  type="range"
                  min="3"
                  max="12"
                  value={kValue}
                  onChange={(e) => setKValue(parseInt(e.target.value))}
                  style={{
                    width: '100%'
                  }}
                />
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '24px'
            }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#f3f4f6'}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  backgroundColor: '#eab308',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#d97706'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#eab308'}
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

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        /* Performant CSS hover effect for hexagons */
        .hex-hover {
          transition: transform 0.2s ease-out;
          cursor: pointer;
          transform-origin: center center;
          transform-box: fill-box;
        }
        
        .hex-hover:hover {
          transform: scale(1.3);
        }
        
        /* Cursor style for hexagons */
        .hex-normal {
          cursor: default;
        }
      `}</style>
    </div>
  );
};

// Main App component that renders the HexGrid
const App = () => {
  return (
    <div className="App" style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <HexGrid />
    </div>
  );
};

export default App;
