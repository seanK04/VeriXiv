import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, FileText, Database, Link2, CheckCircle, Loader } from 'lucide-react';
import './App.css';

// Helper function to parse arXiv URLs/IDs
const parseArxivUrl = (input) => {
  const cleaned = input.trim();
  
  const patterns = [
    /arxiv\.org\/abs\/(\d+\.\d+(?:v\d+)?)/i,
    /arxiv\.org\/pdf\/(\d+\.\d+(?:v\d+)?)/i,
    /^(\d{4}\.\d{4,5}(?:v\d+)?)$/,
    /arxiv:(\d+\.\d+(?:v\d+)?)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return match[1];
  }
  
  return null;
};

const HexGrid = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [inputMode, setInputMode] = useState('arxiv'); // 'arxiv' or 'upload'
  const [arxivInput, setArxivInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [kValue, setKValue] = useState(5);
  const [loading, setLoading] = useState(false);
  const [activeHexagons, setActiveHexagons] = useState([]);
  const [connections, setConnections] = useState([]);
  const [papers, setPapers] = useState([]);
  const [showCards, setShowCards] = useState(false);
  const [hoveredPaper, setHoveredPaper] = useState(null);
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
    if (!autoScroll || modalOpen) return; // Don't auto-scroll when modal is open
    
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
  }, [autoScroll, modalOpen]);

  // Handle mouse/touch drag with RAF for smooth updates
  const rafRef = useRef(null);
  
  const handlePointerDown = (e) => {
    if (modalOpen) return; // Don't allow dragging when modal is open
    setIsDragging(true);
    setAutoScroll(false);
    setDragStart({
      x: e.clientX - gridOffset.x,
      y: e.clientY - gridOffset.y
    });
  };

  const handlePointerMove = (e) => {
    if (!isDragging || modalOpen) return; // Don't allow dragging when modal is open
    
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

  // Stop dragging when modal opens
  useEffect(() => {
    if (modalOpen) {
      setIsDragging(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (wheelRafRef.current) {
        cancelAnimationFrame(wheelRafRef.current);
      }
    }
  }, [modalOpen]);

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
    if (modalOpen) return; // Don't allow scrolling when modal is open
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

  // File upload handlers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFileError('');
    
    if (!file) return;
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      setFileError('Please upload a PDF file');
      setUploadedFile(null);
      return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setFileError('File size must be less than 10MB');
      setUploadedFile(null);
      return;
    }
    
    setUploadedFile(file);
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setFileError('');
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Create a synthetic event to reuse handleFileChange
      const syntheticEvent = {
        target: {
          files: [file]
        }
      };
      handleFileChange(syntheticEvent);
    }
  };

  // Scatter hexagon selection - cluster around center, max 3 hexagons away
  const scatterHexagons = (hexagons, count) => {
    const maxDistance = 3; // Maximum hexagons away from center
    
    // Filter hexagons within maxDistance from center (0,0)
    // Using Manhattan distance for hex grid: |row| + |col|
    const nearbyHexagons = hexagons
      .filter(h => !isCenterHex(h))
      .filter(h => {
        const distance = Math.abs(h.row) + Math.abs(h.col);
        return distance <= maxDistance * 2; // Multiply by 2 for hex grid spacing
      });
    
    // Shuffle and take the first 'count' hexagons
    const shuffled = nearbyHexagons.sort(() => Math.random() - 0.5);
    
    return shuffled.slice(0, Math.min(count, shuffled.length));
  };

  // Submit handler with API integration
  const handleSubmit = async () => {
    let paperId;
    
    if (inputMode === 'arxiv') {
      // Parse arXiv URL
      paperId = parseArxivUrl(arxivInput);
      if (!paperId) {
        alert('Invalid arXiv URL or ID. Please check your input.');
        return;
      }
      
      console.log('Processing arXiv paper:', paperId);
      // TODO: Call backend API for arXiv paper
      // const pdfUrl = `https://arxiv.org/pdf/${paperId}.pdf`;
      
    } else {
      // Handle PDF upload
      if (!uploadedFile) {
        alert('Please select a PDF file to upload');
        return;
      }
      
      console.log('Uploading PDF:', uploadedFile.name);
      // TODO: Call backend API for PDF upload
      paperId = 'uploaded_' + Date.now();
    }
    
    setLoading(true);
    setModalOpen(false);
    
    // Select scattered hexagons across the grid
    const nearby = scatterHexagons(visibleHexagons, Math.min(kValue, 12));
    
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
    setShowCards(true); // Show cards initially
    setLoading(false);
    
    // Fade out cards after 1 second
    setTimeout(() => {
      setShowCards(false);
    }, 1000);
  };

  const handleReset = () => {
    setActiveHexagons([]);
    setConnections([]);
    setPapers([]);
    setShowCards(false);
    setHoveredPaper(null);
    setArxivInput('');
    setUploadedFile(null);
    setFileError('');
    setInputMode('arxiv');
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
                className={isActive ? 'hex-yellow' : 'hex-normal'}
                style={{ 
                  pointerEvents: 'auto',
                  transformOrigin: 'center',
                  cursor: isActive ? 'pointer' : 'default'
                }}
                onMouseEnter={() => {
                  if (isActive) {
                    // Find the paper associated with this hexagon
                    const paper = papers.find(p => p.hex.id === hex.id);
                    if (paper) setHoveredPaper(paper.id);
                  } else {
                    setHoveredHex(hex.id);
                  }
                }}
                onMouseLeave={() => {
                  if (isActive) {
                    setHoveredPaper(null);
                  } else {
                    setHoveredHex(null);
                  }
                }}
              >
                <polygon
                  points={createHexPath(0, 0, hexSize)}
                  fill={hoveredHex === hex.id && !isActive ? '#f3f4f6' : getHexColor(hex)}
                  stroke={getHexStroke(hex)}
                  strokeWidth={isActive ? "1.5" : "1"}
                  style={{
                    animation: isActive ? 'rotateHex 0.6s ease-out' : undefined,
                    transition: 'fill 0.15s ease-out, transform 0.2s ease-out'
                  }}
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

      {/* Tooltip - Hover Instruction */}
      {papers.length > 0 && !showCards && !hoveredPaper && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          right: '16px',
          backgroundColor: 'rgba(234, 179, 8, 0.95)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 25,
          animation: 'fadeIn 0.5s ease-out',
          pointerEvents: 'none'
        }}>
          💡 Hover over yellow hexagons to see paper details
        </div>
      )}

      {/* Paper Cards */}
      {papers.map((paper, idx) => {
        const screenX = viewportSize.width / 2 + paper.hex.x + gridOffset.x;
        const screenY = viewportSize.height / 2 + paper.hex.y + gridOffset.y;
        const cardOffset = idx % 2 === 0 ? 80 : -80;
        
        const isHovered = hoveredPaper === paper.id;
        const shouldRender = showCards || isHovered || papers.length > 0;
        
        if (!shouldRender && !showCards) return null;
        
        // Determine animation state
        let animationStyle;
        if (isHovered) {
          // Quick fade in on hover
          animationStyle = 'fadeIn 0.2s ease-out forwards';
        } else if (showCards) {
          // Initial staggered fade in
          animationStyle = `fadeIn 0.5s ease-out ${idx * 0.1}s forwards`;
        } else {
          // Natural fade out with slight upward movement
          animationStyle = `fadeOutUp 0.6s ease-out forwards`;
        }
        
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
              pointerEvents: isHovered ? 'auto' : 'none',
              left: screenX + cardOffset,
              top: screenY - 60,
              animation: animationStyle,
              opacity: showCards || isHovered ? 1 : 0
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
            maxWidth: '500px',
            width: '100%',
            margin: '16px'
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '24px'
            }}>Enter Paper Details</h2>

            {/* Tab Toggle */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px',
              backgroundColor: '#f3f4f6',
              padding: '4px',
              borderRadius: '8px'
            }}>
              <button
                onClick={() => setInputMode('arxiv')}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  backgroundColor: inputMode === 'arxiv' ? 'white' : 'transparent',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: inputMode === 'arxiv' ? '#111827' : '#6b7280',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: inputMode === 'arxiv' ? '0 1px 3px 0 rgba(0, 0, 0, 0.1)' : 'none'
                }}
              >
                arXiv Link
              </button>
              <button
                onClick={() => setInputMode('upload')}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  backgroundColor: inputMode === 'upload' ? 'white' : 'transparent',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: inputMode === 'upload' ? '#111827' : '#6b7280',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: inputMode === 'upload' ? '0 1px 3px 0 rgba(0, 0, 0, 0.1)' : 'none'
                }}
              >
                Upload PDF
              </button>
            </div>

            {/* arXiv Input Mode */}
            {inputMode === 'arxiv' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  arXiv URL or Paper ID
                </label>
                <input
                  type="text"
                  value={arxivInput}
                  onChange={(e) => setArxivInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxSizing: 'border-box'
                  }}
                  placeholder="https://arxiv.org/abs/2103.12345 or 2103.12345"
                  onFocus={(e) => {
                    e.target.style.borderColor = '#eab308';
                    e.target.style.boxShadow = '0 0 0 2px rgba(234, 179, 8, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <p style={{
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  marginTop: '6px'
                }}>
                  Paste any arXiv link format (abstract or PDF)
                </p>
              </div>
            )}

            {/* Upload Mode */}
            {inputMode === 'upload' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Upload PDF
                </label>
                
                {!uploadedFile ? (
                  <label style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '32px',
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: '#fafafa'
                  }}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = '#eab308';
                    e.currentTarget.style.backgroundColor = '#fffbeb';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.backgroundColor = '#fafafa';
                  }}>
                    <FileText size={32} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                    <span style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontWeight: 500,
                      marginBottom: '4px'
                    }}>
                      Click to upload or drag and drop
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      PDF files only, max 10MB
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    backgroundColor: '#f9fafb'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={20} style={{ color: '#eab308' }} />
                      <span style={{
                        fontSize: '14px',
                        color: '#374151',
                        fontWeight: 500
                      }}>
                        {uploadedFile.name}
                      </span>
                    </div>
                    <button
                      onClick={handleRemoveFile}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6b7280',
                        transition: 'color 0.15s'
                      }}
                      onMouseOver={(e) => e.target.style.color = '#ef4444'}
                      onMouseOut={(e) => e.target.style.color = '#6b7280'}
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}
                
                {fileError && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: '#ef4444',
                    marginTop: '6px'
                  }}>
                    {fileError}
                  </p>
                )}
              </div>
            )}

            {/* K-Value Slider (shown for both modes) */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px'
              }}>
                Number of similar papers (k = {kValue})
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

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setFileError('');
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
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
                disabled={inputMode === 'arxiv' ? !arxivInput : !uploadedFile}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: (inputMode === 'arxiv' ? !arxivInput : !uploadedFile) ? '#d1d5db' : '#eab308',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'white',
                  border: 'none',
                  cursor: (inputMode === 'arxiv' ? !arxivInput : !uploadedFile) ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseOver={(e) => {
                  if (!(inputMode === 'arxiv' ? !arxivInput : !uploadedFile)) {
                    e.target.style.backgroundColor = '#d97706';
                  }
                }}
                onMouseOut={(e) => {
                  if (!(inputMode === 'arxiv' ? !arxivInput : !uploadedFile)) {
                    e.target.style.backgroundColor = '#eab308';
                  }
                }}
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
        
        /* Yellow hexagon hover effects */
        .hex-yellow {
          cursor: pointer;
          transition: transform 0.2s ease-out, filter 0.2s ease-out;
        }
        
        .hex-yellow:hover {
          transform: scale(1.15);
          filter: brightness(1.1) drop-shadow(0 0 8px rgba(234, 179, 8, 0.4));
        }
        
        /* Cursor style for hexagons */
        .hex-normal {
          cursor: default;
        }
        
        /* Fade out animation */
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        
        /* Natural fade out with upward movement */
        @keyframes fadeOutUp {
          0% { 
            opacity: 1; 
            transform: translateY(0);
          }
          100% { 
            opacity: 0; 
            transform: translateY(-20px);
          }
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
