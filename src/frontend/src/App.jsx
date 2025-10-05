import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, FileText, Database, Link2, CheckCircle, Loader, Cpu, Code, Server, TrendingUp, BarChart, Sliders, Circle, Minus } from 'lucide-react';
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
  const [paperName, setPaperName] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeHexagons, setActiveHexagons] = useState([]);
  const [connections, setConnections] = useState([]);
  const [papers, setPapers] = useState([]);
  const [showCards, setShowCards] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [hoveredPaper, setHoveredPaper] = useState(null);
  const [fadingCards, setFadingCards] = useState(new Set());
  const [hintDismissed, setHintDismissed] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [gridOffset, setGridOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [autoScroll, setAutoScroll] = useState(true);
  const [hoveredHex, setHoveredHex] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [collapsedQueries, setCollapsedQueries] = useState(new Set());
  const [queryIdCounter, setQueryIdCounter] = useState(0);
  const [draggingHex, setDraggingHex] = useState(null); // Track which hex is being dragged
  const [draggedHexPosition, setDraggedHexPosition] = useState(null); // Current drag position

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

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
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

  // Convert screen coordinates to world coordinates
  const screenToWorld = (screenX, screenY) => {
    return {
      x: screenX - viewportSize.width / 2 - gridOffset.x,
      y: screenY - viewportSize.height / 2 - gridOffset.y
    };
  };

  // Find the nearest grid position to a given world coordinate
  const findNearestGridPosition = (worldX, worldY) => {
    // Convert world coordinates to approximate row/col
    const approxCol = Math.round(worldX / hexWidth);
    const approxRow = Math.round(worldY / vertDist);
    
    // Check nearby positions to find the closest one
    const candidates = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
      for (let colOffset = -1; colOffset <= 1; colOffset++) {
        const row = approxRow + rowOffset;
        const col = approxCol + colOffset;
        const x = col * hexWidth + (row % 2) * (hexWidth / 2);
        const y = row * vertDist;
        const distance = Math.sqrt((x - worldX) ** 2 + (y - worldY) ** 2);
        candidates.push({ row, col, x, y, distance, id: `${col}-${row}` });
      }
    }
    
    // Return the closest position
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0];
  };

  // Check if a grid position is occupied by an active hexagon (excluding the dragging one)
  const isPositionOccupied = (gridId, excludeHexId = null) => {
    return activeHexagons.some(h => h.id === gridId && h.id !== excludeHexId);
  };

  // Check if a grid position is valid for dropping (not center, not occupied)
  const isValidDropPosition = (gridPosition, excludeHexId = null) => {
    // Can't drop on center hexagon
    if (gridPosition.col === 0 && gridPosition.row === 0) {
      return false;
    }
    // Can't drop on occupied position
    return !isPositionOccupied(gridPosition.id, excludeHexId);
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
  
  // Filter out papers from collapsed queries (but keep the blue uploaded paper)
  const visiblePapers = papers.filter(paper => 
    paper.isUploadedPaper || !collapsedQueries.has(paper.queryId)
  );
  const visibleActiveHexagons = activeHexagons.filter(hex => {
    const paper = papers.find(p => p.hex.id === hex.id);
    return !paper || paper.isUploadedPaper || !collapsedQueries.has(paper.queryId);
  });
  const visibleConnections = connections.filter(hex => {
    const paper = papers.find(p => p.hex.id === hex.id);
    return !paper || paper.isUploadedPaper || !collapsedQueries.has(paper.queryId);
  });

  // Animate grid panning
  useEffect(() => {
    if (!autoScroll || modalOpen || selectedPaper) return; // Don't auto-scroll when modal or popup is open
    
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
  }, [autoScroll, modalOpen, selectedPaper]);

  // Handle mouse/touch drag with RAF for smooth updates
  const rafRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const fadeTimeoutsRef = useRef(new Map()); // Track fade timeouts per paper ID
  
  const handlePointerDown = (e) => {
    if (modalOpen || selectedPaper) return; // Don't allow dragging when modal or popup is open
    
    // If dragging a hexagon, don't start grid drag
    if (draggingHex) return;
    
    setIsDragging(true);
    setAutoScroll(false);
    setDragStart({
      x: e.clientX - gridOffset.x,
      y: e.clientY - gridOffset.y
    });
  };

  const handlePointerMove = (e) => {
    if (modalOpen || selectedPaper) return; // Don't allow dragging when modal or popup is open
    
    // Handle hexagon dragging
    if (draggingHex) {
      // Cancel any pending animation frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      
      // Convert screen position to world coordinates
      const world = screenToWorld(e.clientX, e.clientY);
      
      // Find nearest grid position
      const nearest = findNearestGridPosition(world.x, world.y);
      
      // Only update if position is valid (not center, not occupied)
      if (isValidDropPosition(nearest, draggingHex.id)) {
        rafRef.current = requestAnimationFrame(() => {
          setDraggedHexPosition(nearest);
        });
      }
      return;
    }
    
    // Handle grid dragging
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
    // Handle hexagon drop
    if (draggingHex && draggedHexPosition) {
      // Only commit the move if the position is valid
      if (isValidDropPosition(draggedHexPosition, draggingHex.id)) {
        // Update the hexagon's position in activeHexagons and papers
        setActiveHexagons(prev => prev.map(h => 
          h.id === draggingHex.id ? draggedHexPosition : h
        ));
        
        setPapers(prev => prev.map(p => 
          p.hex.id === draggingHex.id ? { ...p, hex: draggedHexPosition } : p
        ));
        
        setConnections(prev => prev.map(h => 
          h.id === draggingHex.id ? draggedHexPosition : h
        ));
      }
      // If position is invalid, hexagon stays at original position
    }
    
    // Clean up drag state
    setDraggingHex(null);
    setDraggedHexPosition(null);
    setIsDragging(false);
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  };

  // Stop dragging when modal or popup opens
  useEffect(() => {
    if (modalOpen || selectedPaper) {
      setIsDragging(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (wheelRafRef.current) {
        cancelAnimationFrame(wheelRafRef.current);
      }
    }
  }, [modalOpen, selectedPaper]);

  // Handle keyboard navigation and shift detection
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Track shift key press
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      
      // Handle ESC key for closing popup
      if (e.key === 'Escape') {
        if (selectedPaper) {
          e.preventDefault();
          setSelectedPaper(null);
          return;
        }
      }
      
      // Don't process shortcuts when modal is open (user may be typing)
      if (modalOpen || selectedPaper) return;
      
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
    
    const handleKeyUp = (e) => {
      // Track shift key release
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        
        // Cancel hexagon drag if shift is released
        if (draggingHex) {
          setDraggingHex(null);
          setDraggedHexPosition(null);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [modalOpen, selectedPaper, draggingHex]);

  // Clear hovered paper when shift is pressed
  useEffect(() => {
    if (isShiftPressed) {
      setHoveredPaper(null);
      setFadingCards(new Set());
    }
  }, [isShiftPressed]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      fadeTimeoutsRef.current.forEach(timeouts => {
        clearTimeout(timeouts.hover);
        clearTimeout(timeouts.cleanup);
      });
      fadeTimeoutsRef.current.clear();
    };
  }, []);

  // Handle mouse wheel zoom/pan with RAF for smooth updates
  const wheelRafRef = useRef(null);
  
  const handleWheel = (e) => {
    if (modalOpen || selectedPaper) return; // Don't allow scrolling when modal or popup is open
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
  const scatterHexagons = (hexagons, count, excludeHexagons = []) => {
    const maxDistance = 3; // Maximum hexagons away from center
    
    // Create a Set of already-used hexagon IDs for fast lookup
    const usedIds = new Set(excludeHexagons.map(h => h.id));
    
    // Filter hexagons within maxDistance from center (0,0)
    // Using Manhattan distance for hex grid: |row| + |col|
    const nearbyHexagons = hexagons
      .filter(h => !isCenterHex(h))
      .filter(h => !usedIds.has(h.id)) // Exclude already-used hexagons
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
    let paperText = null;
    const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';
    const FLASK_URL = 'https://photoheliographic-unmorosely-king.ngrok-free.dev'; // Your ngrok URL
    
    setLoading(true);
    setModalOpen(false);
    
    try {
      if (inputMode === 'arxiv') {
        // Parse arXiv URL
        paperId = parseArxivUrl(arxivInput);
        if (!paperId) {
          alert('Invalid arXiv URL or ID. Please check your input.');
          setLoading(false);
          setModalOpen(true);
          return;
        }
        
        console.log('Processing arXiv paper:', paperId);
        
      } else {
        // Handle PDF upload
        if (!uploadedFile) {
          alert('Please select a PDF file to upload');
          setLoading(false);
          setModalOpen(true);
          return;
        }
        
        console.log('Uploading PDF:', uploadedFile.name);
        
        // Step 1: Upload PDF to Flask for text extraction
        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        const uploadResponse = await fetch(`${FLASK_URL}/upload-pdf`, {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error || 'Failed to upload PDF');
        }
        
        const uploadData = await uploadResponse.json();
        paperId = uploadData.paper_id;
        paperText = uploadData.text;
        
        console.log(`PDF uploaded successfully. Paper ID: ${paperId}, Text length: ${uploadData.text_length}`);
      }
      
      // Call the orchestrator endpoint
      console.log('Calling Worker API at:', WORKER_URL);
      
      const response = await fetch(`${WORKER_URL}/api/analyze-full-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: inputMode === 'arxiv' ? paperId : null,
          paper_text: paperText, // Only set for PDF uploads
          k: kValue
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }
      
      console.log(`Received ${data.similar_papers.length} similar papers${data.uploaded_paper ? ' + uploaded paper' : ''}`);
      
      // Calculate total hexagons needed (similar papers + uploaded paper if exists)
      const totalPapers = data.similar_papers.length + (data.uploaded_paper ? 1 : 0);
      
      // Select scattered hexagons across the grid, excluding already-used ones
      const nearby = scatterHexagons(visibleHexagons, Math.min(totalPapers, 12), activeHexagons);
      
      // Animate hexagons turning on
      for (let i = 0; i < nearby.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        setActiveHexagons(prev => [...prev, nearby[i]]);
      }
      
      // Get current query ID and increment for next query
      const currentQueryId = queryIdCounter;
      setQueryIdCounter(prev => prev + 1);
      
      // Map similar papers to paper format
      const mappedSimilarPapers = data.similar_papers.map((paper, idx) => ({
        id: paper.id,
        title: paper.title,
        score: paper.reproducibility_score, // Already 0-100
        dataAvailable: paper.data_available,
        codeAvailable: paper.code_available,
        replications: Math.round(paper.similarity_score * 100), // Convert similarity to percentage
        rubricBreakdown: paper.rubric_breakdown,
        assessment: paper.assessment,
        isUploadedPaper: false,
        queryId: currentQueryId,
        hex: nearby[idx]
      }));
      
      // Add uploaded paper if it exists
      const allPapers = [...mappedSimilarPapers];
      if (data.uploaded_paper) {
        const customName = paperName.trim() || 'Your Uploaded Paper';
        const uploadedPaperObj = {
          id: data.uploaded_paper.id,
          title: customName, // Use custom name as the title
          originalTitle: data.uploaded_paper.title, // Store original title
          score: data.uploaded_paper.reproducibility_score,
          dataAvailable: data.uploaded_paper.data_available,
          codeAvailable: data.uploaded_paper.code_available,
          replications: Math.round(data.uploaded_paper.similarity_score * 100),
          rubricBreakdown: data.uploaded_paper.rubric_breakdown,
          assessment: data.uploaded_paper.assessment,
          isUploadedPaper: true,
          queryId: currentQueryId,
          paperName: customName, // Also store in paperName for label
          hex: nearby[mappedSimilarPapers.length] // Assign to the next available hexagon
        };
        allPapers.push(uploadedPaperObj);
        console.log(`Uploaded paper score: ${uploadedPaperObj.score}%`);
      }
      
      const mappedPapers = allPapers;
      
      // Append new papers and connections to existing ones
      setPapers(prev => [...prev, ...mappedPapers]);
      setConnections(prev => [...prev, ...nearby]);
      setShowCards(true); // Show cards initially
      setIsFadingOut(false); // Reset fade-out state
      setLoading(false);
      
      // Clear the paper name for next query
      setPaperName('');
      
      // Start fade out after 2 seconds
      setTimeout(() => {
        setIsFadingOut(true);
      }, 2000);
      
      // Hide cards completely after fade-out animation completes
      // Cards fade out in staggered fashion (0.1s per card) + 0.6s animation duration
      const fadeOutDuration = (mappedPapers.length * 0.1 + 0.6) * 1000;
      setTimeout(() => {
        setShowCards(false);
        setIsFadingOut(false);
        // Show hint after cards fade out (only if not previously dismissed)
        if (!hintDismissed) {
          setHintVisible(true);
        }
      }, 2000 + fadeOutDuration);
      
    } catch (error) {
      console.error('Analysis error:', error);
      alert(`Failed to analyze paper: ${error.message}\n\nPlease make sure:\n1. Flask backend is running on port 1919\n2. Worker is deployed or running locally\n3. The arXiv ID is valid`);
      setLoading(false);
      setModalOpen(true); // Reopen modal so user can try again
    }
  };

  const handleReset = () => {
    // Clear any pending hover timeouts
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Clear all fade timeouts
    fadeTimeoutsRef.current.forEach(timeouts => {
      clearTimeout(timeouts.hover);
      clearTimeout(timeouts.cleanup);
    });
    fadeTimeoutsRef.current.clear();
    
    setActiveHexagons([]);
    setConnections([]);
    setPapers([]);
    setShowCards(false);
    setIsFadingOut(false);
    setHoveredPaper(null);
    setFadingCards(new Set());
    setHintVisible(false);
    setArxivInput('');
    setUploadedFile(null);
    setFileError('');
    setInputMode('arxiv');
    setKValue(5);
    setPaperName('');
    setDraggingHex(null);
    setDraggedHexPosition(null);
  };

  const isCenterHex = (hex) => {
    return hex.col === 0 && hex.row === 0;
  };

  const isActiveHex = (hex) => {
    return visibleActiveHexagons.find(h => h.id === hex.id);
  };

  // Convert score (0-100) to color gradient: red -> yellow -> green
  const getScoreColor = (score) => {
    if (score >= 80) {
      // High scores (80-100): Yellow to Green
      const t = (score - 80) / 20; // 0 to 1
      const r = Math.round(234 - t * 112); // 234 to 122
      const g = Math.round(179 + t * 68);  // 179 to 247
      const b = Math.round(8 + t * 86);    // 8 to 94
      return `rgb(${r}, ${g}, ${b})`;
    } else if (score >= 50) {
      // Medium scores (50-80): Red/Orange to Yellow
      const t = (score - 50) / 30; // 0 to 1
      const r = Math.round(239 - t * 5);   // 239 to 234
      const g = Math.round(68 + t * 111);  // 68 to 179
      const b = 8;                         // constant
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Low scores (0-50): Dark Red to Red/Orange
      const t = score / 50; // 0 to 1
      const r = Math.round(185 + t * 54);  // 185 to 239
      const g = Math.round(28 + t * 40);   // 28 to 68
      const b = 8;                         // constant
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  const getHexColor = (hex) => {
    if (isCenterHex(hex)) return '#E8E8E8'; // Light grey matching header
    if (isActiveHex(hex)) {
      // Find the associated paper to get its score
      const paper = papers.find(p => p.hex.id === hex.id);
      if (paper) {
        // Blue color for uploaded paper
        if (paper.isUploadedPaper) {
          return '#3B82F6'; // Blue color
        }
        return getScoreColor(paper.score);
      }
      return '#ffcc00'; // Fallback
    }
    return '#ffffff';
  };

  const getHexStroke = (hex) => {
    if (isCenterHex(hex)) return '#B8B8B8'; // Darker grey for stroke
    if (isActiveHex(hex)) {
      // Find the associated paper to get its score
      const paper = papers.find(p => p.hex.id === hex.id);
      if (paper) {
        // Darker blue stroke for uploaded paper
        if (paper.isUploadedPaper) {
          return '#1E40AF'; // Darker blue for stroke
        }
        // Darken the fill color for the stroke
        const fillColor = getScoreColor(paper.score);
        // Simple darkening by reducing RGB values
        const match = fillColor.match(/rgb\((\d+), (\d+), (\d+)\)/);
        if (match) {
          const [_, r, g, b] = match.map(Number);
          return `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)})`;
        }
      }
      return '#f59e0b'; // Fallback
    }
    return '#d1d5db';
  };

  // Rubric fields in order
  const RUBRIC_FIELDS = [
    "Model Description",
    "Link to Code",
    "Infrastructure",
    "Runtime",
    "Parameters",
    "Validation Performance",
    "Metrics",
    "Number of Training/Eval Runs",
    "Hyperparameter Bounds",
    "Hyperparameter Best Config",
    "Hyperparameter Search",
    "Hyperparameter Method",
    "Expected Performance",
    "Data Statistics",
    "Data Split",
    "Data Processing",
    "Data Download",
    "New Data Description",
    "Data Languages"
  ];

  // Get icon for rubric field
  const getRubricIcon = (field) => {
    const iconProps = { size: 18, strokeWidth: 2 };
    
    if (field.includes("Model") || field.includes("Parameters")) {
      return <Cpu {...iconProps} />;
    } else if (field.includes("Code") || field.includes("Link")) {
      return <Code {...iconProps} />;
    } else if (field.includes("Infrastructure") || field.includes("Runtime")) {
      return <Server {...iconProps} />;
    } else if (field.includes("Performance") || field.includes("Metrics") || field.includes("Expected")) {
      return <TrendingUp {...iconProps} />;
    } else if (field.includes("Hyperparameter")) {
      return <Sliders {...iconProps} />;
    } else if (field.includes("Data") || field.includes("Dataset")) {
      return <Database {...iconProps} />;
    } else {
      return <BarChart {...iconProps} />;
    }
  };

  // Get status icon for grade
  const getGradeIcon = (grade) => {
    const iconSize = 20;
    
    if (grade === "Complete") {
      return <Circle size={iconSize} fill="currentColor" strokeWidth={0} style={{ color: '#10b981' }} />;
    } else if (grade === "Partial") {
      // Semi-circle filled from left
      return (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" style={{ color: '#f59e0b' }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M 12 2 A 10 10 0 0 1 12 22 Z" fill="currentColor" />
        </svg>
      );
    } else if (grade === "Not Present") {
      return <Circle size={iconSize} fill="none" stroke="currentColor" strokeWidth={2} style={{ color: '#ef4444' }} />;
    } else if (grade === "Not Applicable") {
      return <Minus size={iconSize} strokeWidth={2} style={{ color: '#9ca3af' }} />;
    }
    
    return <Minus size={iconSize} strokeWidth={2} style={{ color: '#9ca3af' }} />;
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
        cursor: draggingHex ? 'grabbing' : (isDragging ? 'grabbing' : 'grab'),
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        position: 'fixed',
        top: 0,
        left: 0
      }}
    >
      {/* Header - arXiv themed */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        pointerEvents: 'none'
      }}>
        {/* Red arXiv-style header bar */}
        <div style={{
          width: '100%',
          backgroundColor: '#B31B1B',
          padding: '16px 24px',
          borderBottom: '1px solid #8B1515'
        }}>
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 600,
            color: 'white',
            margin: 0,
            letterSpacing: '-0.02em'
          }}>VeriXiv</h1>
          </div>
        
        {/* Grey subtitle bar */}
        <div style={{
          width: '100%',
          backgroundColor: '#E8E8E8',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #D0D0D0'
        }}>
          <p style={{
            fontSize: '0.95rem',
            color: '#333333',
            margin: 0,
            fontWeight: 500
          }}>Reproducibility Checker &gt; Verify scientific rigor in ML research</p>
          {papers.length > 0 && (
            <button
              onClick={handleReset}
              style={{
                padding: '8px 16px',
                backgroundColor: '#B31B1B',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
                pointerEvents: 'auto'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#8B1515'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#B31B1B'}
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
          <div>🖱️ <strong>Shift + Drag</strong> to move hexagons</div>
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
          {visibleConnections.map((hex, idx) => {
            // Use dragged position if this hex is being dragged
            const hexPosition = draggingHex && hex.id === draggingHex.id && draggedHexPosition 
              ? draggedHexPosition 
              : hex;
            
            return (
              <line
                key={`line-${hex.id}`}
                x1="0"
                y1="0"
                x2={hexPosition.x}
                y2={hexPosition.y}
                stroke="#fbbf24"
                strokeWidth="2"
                strokeDasharray="5,5"
                opacity="0.6"
                style={{
                  animation: `drawLine 0.5s ease-out ${idx * 0.1}s forwards`,
                  strokeDashoffset: 1000
                }}
              />
            );
          })}
          
          {/* Hexagons - non-center first */}
          {visibleHexagons.filter(hex => !isCenterHex(hex)).map((hex) => {
            const isActive = isActiveHex(hex);
            
            // Get the actual position (dragged position if being dragged, original otherwise)
            const actualHex = draggingHex && hex.id === draggingHex.id && draggedHexPosition 
              ? draggedHexPosition 
              : hex;
            
            return (
              <g
                key={hex.id}
                transform={`translate(${actualHex.x}, ${actualHex.y})`}
                className={isActive ? 'hex-yellow' : 'hex-normal'}
                style={{ 
                  pointerEvents: 'auto',
                  transformOrigin: 'center',
                  cursor: draggingHex && hex.id === draggingHex.id ? 'grabbing' : (isActive && isShiftPressed ? 'grab' : (isActive ? 'pointer' : 'default')),
                  opacity: draggingHex && hex.id === draggingHex.id ? 0.7 : 1
                }}
                onClick={(e) => {
                  if (isActive) {
                    e.stopPropagation();
                    const paper = papers.find(p => p.hex.id === hex.id);
                    if (paper) {
                      // Shift + Click on blue hexagon to collapse query (only if not dragging)
                      if (e.shiftKey && paper.isUploadedPaper && !draggingHex) {
                        setCollapsedQueries(prev => {
                          const next = new Set(prev);
                          if (next.has(paper.queryId)) {
                            next.delete(paper.queryId);
                          } else {
                            next.add(paper.queryId);
                          }
                          return next;
                        });
                      } else if (!e.shiftKey && !draggingHex) {
                        // Normal click opens rubric popup
                        setSelectedPaper(paper);
                      }
                    }
                  }
                }}
                onMouseDown={(e) => {
                  if (isActive) {
                    e.stopPropagation();
                    
                    // Start hexagon drag on shift+click
                    if (e.shiftKey && isShiftPressed) {
                      setDraggingHex(hex);
                      setDraggedHexPosition(hex);
                    }
                  }
                }}
                onMouseEnter={() => {
                  if (isActive) {
                    // Find the paper associated with this hexagon
                    const paper = papers.find(p => p.hex.id === hex.id);
                    if (paper && !isShiftPressed) {
                      // Only show hover card if shift is not pressed
                      // Clear any pending timeouts for this specific paper
                      const timeouts = fadeTimeoutsRef.current.get(paper.id);
                      if (timeouts) {
                        clearTimeout(timeouts.hover);
                        clearTimeout(timeouts.cleanup);
                        fadeTimeoutsRef.current.delete(paper.id);
                      }
                      
                      // Remove from fading set if it was fading
                      setFadingCards(prev => {
                        const next = new Set(prev);
                        next.delete(paper.id);
                        return next;
                      });
                      setHoveredPaper(paper.id);
                    }
                  } else {
                    // Clear any pending timeout from previous white hexagon
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                    }
                    setHoveredHex(hex.id);
                  }
                }}
                onMouseLeave={() => {
                  if (isActive) {
                    const paper = papers.find(p => p.hex.id === hex.id);
                    if (paper) {
                      // Clear any existing timeouts for this paper
                      const existingTimeouts = fadeTimeoutsRef.current.get(paper.id);
                      if (existingTimeouts) {
                        clearTimeout(existingTimeouts.hover);
                        clearTimeout(existingTimeouts.cleanup);
                      }
                      
                      // Immediately add to fading set to keep card rendered
                      setFadingCards(prev => new Set(prev).add(paper.id));
                      
                      // Then clear hovered state after small delay
                      const hoverTimeout = setTimeout(() => {
                        setHoveredPaper(prev => prev === paper.id ? null : prev);
                      }, 50);
                      
                      // Remove from fading set after animation completes
                      const cleanupTimeout = setTimeout(() => {
                        setFadingCards(prev => {
                          const next = new Set(prev);
                          next.delete(paper.id);
                          return next;
                        });
                        fadeTimeoutsRef.current.delete(paper.id);
                      }, 450); // 50ms delay + 400ms animation
                      
                      // Store both timeouts
                      fadeTimeoutsRef.current.set(paper.id, {
                        hover: hoverTimeout,
                        cleanup: cleanupTimeout
                      });
                    }
                  } else {
                    // Debounce the mouse leave for white hexagons
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                    }
                    hoverTimeoutRef.current = setTimeout(() => {
                      setHoveredHex(null);
                    }, 50);
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
                {/* Display paper name for blue hexagons */}
                {isActive && (() => {
                  const paper = papers.find(p => p.hex.id === hex.id);
                  return paper?.isUploadedPaper && paper?.paperName ? (
                    <text
                      x="0"
                      y={hexSize + 20}
                      textAnchor="middle"
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        fill: '#1E40AF',
                        pointerEvents: 'none',
                        userSelect: 'none'
                      }}
                    >
                      {paper.paperName}
                    </text>
                  ) : null;
                })()}
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
                    <Plus size={32} stroke="#B8B8B8" strokeWidth={2.5} />
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
      {hintVisible && papers.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '16px',
          backgroundColor: 'rgba(234, 179, 8, 0.95)',
          color: 'white',
          padding: '12px 20px',
          paddingRight: '40px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 25,
          animation: hintVisible ? 'fadeIn 0.5s ease-out' : 'fadeOut 0.4s ease-out',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>💡 Hover over colored hexagons to see paper details</span>
          <button
            onClick={() => {
              setHintDismissed(true);
              setHintVisible(false);
            }}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255, 255, 255, 0.3)',
              border: 'none',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
              fontSize: '16px',
              fontWeight: 'bold',
              transition: 'background 0.2s ease',
              padding: 0,
              lineHeight: 1
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
          >
            ×
          </button>
        </div>
      )}

      {/* Paper Cards */}
      {visiblePapers.map((paper, idx) => {
        // Use dragged position if this paper's hex is being dragged
        const hexPosition = draggingHex && paper.hex.id === draggingHex.id && draggedHexPosition 
          ? draggedHexPosition 
          : paper.hex;
        
        const screenX = viewportSize.width / 2 + hexPosition.x + gridOffset.x;
        const screenY = viewportSize.height / 2 + hexPosition.y + gridOffset.y;
        // All cards to the right
        const cardOffset = 120;
        
        const isHovered = hoveredPaper === paper.id;
        const isFading = fadingCards.has(paper.id);
        
        // Determine visibility state more explicitly
        let cardClass = 'paper-card-hidden';
        let shouldRender = true;
        let fadeDelay = `${idx * 0.1}s`;
        
        if (isHovered) {
          cardClass = 'paper-card-hovered';
          fadeDelay = '0s'; // No delay for hover
        } else if (isFading) {
          cardClass = 'paper-card-unhover-fade';
          fadeDelay = '0s'; // Immediate fade on unhover
        } else if (showCards && !isFadingOut) {
          cardClass = 'paper-card-visible';
          // Staggered fade-in
        } else if (showCards && isFadingOut) {
          cardClass = 'paper-card-fading-out';
          // Staggered fade-out (same order as fade-in)
        } else {
          // Don't render at all if not showing, not hovered, and not fading
          shouldRender = false;
        }
        
        if (!shouldRender) return null;
        
        return (
          <div
            key={paper.id}
            className={cardClass}
            style={{
              position: 'absolute',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              padding: '16px',
              width: '256px',
              zIndex: 10,
              pointerEvents: 'none', // Don't interfere with hexagon hover
              left: screenX + cardOffset,
              top: screenY - 60,
              animationDelay: fadeDelay
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
              alignItems: 'center'
            }}>
              <div style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: getScoreColor(paper.score)
              }}>{paper.score}%</div>
              <div style={{
                marginLeft: '8px',
                fontSize: '0.75rem',
                color: '#6b7280'
              }}>Reproducibility Score</div>
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

            {/* Paper Name Input */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px'
              }}>
                Paper Name (Optional)
              </label>
              <input
                type="text"
                value={paperName}
                onChange={(e) => setPaperName(e.target.value)}
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
                placeholder="e.g., My Research Paper"
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
                Give this paper a custom name for easy identification
              </p>
            </div>

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

      {/* Rubric Popup Modal */}
      {selectedPaper && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 50,
            pointerEvents: 'auto',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setSelectedPaper(null)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              padding: '32px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '85vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'popupScale 0.3s ease-out',
              margin: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '12px',
                lineHeight: 1.4
              }}>
                {selectedPaper.title}
              </h2>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: getScoreColor(selectedPaper.score)
                }}>
                  {selectedPaper.score}%
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  Reproducibility Score
                </div>
              </div>
            </div>

            {/* Rubric Items */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              marginRight: '-8px',
              paddingRight: '8px'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {RUBRIC_FIELDS.map((field, idx) => {
                  const grade = selectedPaper.rubricBreakdown?.[field] || "Not Present";
                  
                  return (
                    <div
                      key={field}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 16px',
                        backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#ffffff',
                        borderRadius: '6px',
                        transition: 'background-color 0.15s',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
                      }}
                    >
                      {/* Category Icon */}
                      <div style={{
                        color: '#6b7280',
                        marginRight: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0
                      }}>
                        {getRubricIcon(field)}
                      </div>

                      {/* Field Name */}
                      <div style={{
                        flex: 1,
                        fontSize: '0.875rem',
                        color: '#374151',
                        fontWeight: 500
                      }}>
                        {field}
                      </div>

                      {/* Grade Status Icon */}
                      <div style={{
                        marginLeft: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0
                      }}>
                        {getGradeIcon(grade)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Close hint */}
            <div style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb',
              fontSize: '0.75rem',
              color: '#9ca3af',
              textAlign: 'center'
            }}>
              Click anywhere or press ESC to close
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

        @keyframes popupScale {
          from { 
            opacity: 0; 
            transform: scale(0.9) translateY(20px); 
          }
          to { 
            opacity: 1; 
            transform: scale(1) translateY(0); 
          }
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
        }
        
        .hex-yellow polygon {
          transition: filter 0.2s ease-out;
        }
        
        .hex-yellow:hover polygon {
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
        
        /* Paper card states */
        .paper-card-visible {
          animation: fadeIn 0.5s ease-out forwards;
          opacity: 0;
          animation-fill-mode: forwards;
        }
        
        .paper-card-fading-out {
          animation: fadeOutUp 0.6s ease-out forwards;
          opacity: 1;
          animation-fill-mode: forwards;
        }
        
        .paper-card-unhover-fade {
          animation: fadeOut 0.4s ease-out forwards;
        }
        
        .paper-card-hovered {
          animation: none;
          opacity: 1;
          transition: opacity 0.2s ease-out;
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
