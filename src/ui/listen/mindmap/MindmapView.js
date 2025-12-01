import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class MindmapView extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            position: relative;
        }

        .mindmap-container {
            overflow-y: auto;
            padding: 12px 16px 16px 16px;
            position: relative;
            z-index: 1;
            min-height: 220px;
            height: 220px;
            width: 600px;
            flex: 1;
        }

        .mindmap-container::-webkit-scrollbar {
            width: 8px;
        }
        .mindmap-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
        }
        .mindmap-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
        }
        .mindmap-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5);
        }

        .mindmap-svg {
            display: block;
            cursor: grab;
        }

        .mindmap-svg:active {
            cursor: grabbing;
        }

        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100px;
            color: rgba(255, 255, 255, 0.5);
            font-size: 13px;
            font-family: 'Helvetica Neue', sans-serif;
        }

        .node {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .node:hover {
            filter: brightness(1.2);
        }

        .node.expanded {
            stroke-width: 3px;
        }

        .node-label {
            font-family: 'Helvetica Neue', sans-serif;
            font-size: 12px;
            fill: white;
            text-anchor: middle;
            pointer-events: none;
            user-select: none;
        }

        .link {
            stroke: rgba(255, 255, 255, 0.3);
            stroke-width: 1.5px;
            fill: none;
            transition: stroke-width 0.2s ease;
        }

        .link:hover {
            stroke-width: 2.5px;
            stroke: rgba(255, 255, 255, 0.5);
        }

        .controls {
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 8px;
            z-index: 10;
        }

        .control-button {
            background: rgba(0, 0, 0, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-family: 'Helvetica Neue', sans-serif;
            transition: background 0.2s ease;
        }

        .control-button:hover {
            background: rgba(0, 0, 0, 0.8);
        }
    `;

    static properties = {
        isVisible: { type: Boolean },
        mindmapData: { type: Object }
    };

    constructor() {
        super();
        this.isVisible = false;
        this.mindmapData = null;
        this.svg = null;
        this.g = null; // Container group for zoom/pan
        this.simulation = null;
        this.zoom = null;
        this.expandedNodes = new Set();
        this.nodeElements = null;
        this.linkElements = null;
    }

    connectedCallback() {
        super.connectedCallback();
        console.log('🗺️ [MindmapView] Component connected');
        if (window.api && window.api.listenView) {
            console.log('🗺️ [MindmapView] Setting up IPC listener for mindmap-update');
            window.api.listenView.onMindmapUpdate((event, data) => {
                console.log('🗺️ [MindmapView] Received mindmap update via IPC:', data?.nodes?.length || 0, 'nodes');
                this.handleMindmapUpdate(data);
            });
        } else {
            console.error('🗺️ [MindmapView] window.api.listenView not available!');
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.simulation) {
            this.simulation.stop();
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('isVisible') && this.isVisible) {
            console.log('🗺️ [MindmapView] isVisible changed to true');
            this.updateComplete.then(() => {
                // Small delay to ensure DOM is ready
                setTimeout(() => {
                    this.initializeMindmap();
                    // If we have data, render it
                    if (this.mindmapData && this.mindmapData.nodes && this.mindmapData.nodes.length > 0) {
                        setTimeout(() => {
                            this.renderMindmap();
                        }, 100);
                    }
                }, 100);
            });
        }
        if (changedProperties.has('mindmapData') && this.mindmapData) {
            console.log('🗺️ [MindmapView] mindmapData changed, nodes:', this.mindmapData.nodes?.length || 0);
            this.updateComplete.then(() => {
                // If SVG not initialized yet, initialize it first
                if (!this.svg) {
                    console.log('🗺️ [MindmapView] SVG not initialized, initializing...');
                    setTimeout(() => {
                        this.initializeMindmap();
                        if (this.svg) {
                            setTimeout(() => {
                                this.renderMindmap();
                            }, 200);
                        }
                    }, 100);
                } else {
                    console.log('🗺️ [MindmapView] SVG already initialized, rendering...');
                    setTimeout(() => {
                        this.renderMindmap();
                    }, 100);
                }
            });
        }
    }

    handleMindmapUpdate(data) {
        console.log('🗺️ [MindmapView] handleMindmapUpdate called with:', {
            hasData: !!data,
            nodesCount: data?.nodes?.length || 0,
            edgesCount: data?.edges?.length || 0,
            isVisible: this.isVisible
        });
        this.mindmapData = data;
        this.requestUpdate();
    }

    initializeMindmap() {
        console.log('🗺️ [MindmapView] initializeMindmap called');
        const container = this.shadowRoot.querySelector('.mindmap-container');
        if (!container) {
            console.warn('🗺️ [MindmapView] Container not found');
            return;
        }

        // Check if D3.js is loaded
        if (typeof d3 === 'undefined') {
            console.error('🗺️ [MindmapView] D3.js not loaded. Please ensure D3.js is available.');
            return;
        }
        
        console.log('🗺️ [MindmapView] D3.js is loaded, proceeding with initialization');

        // Get or find existing SVG from template
        let svgElement = container.querySelector('svg.mindmap-svg');
        if (!svgElement) {
            console.warn('🗺️ [MindmapView] SVG element not found, waiting for DOM update...');
            setTimeout(() => this.initializeMindmap(), 100);
            return;
        }

        // Get container dimensions accounting for padding (12px top, 16px sides, 16px bottom)
        const containerRect = container.getBoundingClientRect();
        const padding = 32; // 16px left + 16px right
        // Default to 600x220, but allow expansion
        const width = Math.max(containerRect.width - padding, 568); // 600 - 32 padding
        const height = Math.max(containerRect.height - 28, 192); // 220 - 28 padding

        // Use existing SVG from template
        this.svg = d3.select(svgElement)
            .attr('width', width)
            .attr('height', height);
        
        // Clear any existing content
        this.svg.selectAll('*').remove();

        // Set up zoom
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                if (this.g) {
                    this.g.attr('transform', event.transform);
                }
            });

        this.svg.call(this.zoom);

        // Create container group for zoom/pan - store as instance variable
        this.g = this.svg.append('g');

        // Create link and node groups
        this.linkElements = this.g.append('g').attr('class', 'links');
        this.nodeElements = this.g.append('g').attr('class', 'nodes');

        // Initial render if data exists
        if (this.mindmapData) {
            this.renderMindmap();
        }

        // Handle window resize
        const resizeHandler = () => {
            if (this.svg && container) {
                const containerRect = container.getBoundingClientRect();
                const width = Math.max(containerRect.width - 32, 568); // 600 - 32 padding
                const height = Math.max(containerRect.height - 28, 192); // 220 - 28 padding
                this.svg.attr('width', width)
                    .attr('height', height);
                
                // Update simulation center
                if (this.simulation) {
                    this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
                    this.simulation.alpha(0.3).restart();
                }
            }
        };
        
        window.addEventListener('resize', resizeHandler);
        
        // Store handler for cleanup
        this._resizeHandler = resizeHandler;
    }

    renderMindmap() {
        console.log('🗺️ [MindmapView] renderMindmap called', {
            hasSvg: !!this.svg,
            hasData: !!this.mindmapData,
            nodesCount: this.mindmapData?.nodes?.length || 0
        });
        
        if (!this.svg) {
            console.warn('🗺️ [MindmapView] SVG not initialized, initializing now...');
            this.initializeMindmap();
            if (!this.svg) {
                console.error('🗺️ [MindmapView] Failed to initialize SVG');
                return;
            }
        }
        
        if (!this.mindmapData) {
            console.warn('🗺️ [MindmapView] No mindmap data available');
            return;
        }

        const data = this.mindmapData;
        const nodes = data.nodes || [];
        const edges = data.edges || [];

        console.log('🗺️ [MindmapView] Rendering mindmap with', nodes.length, 'nodes and', edges.length, 'edges');

        if (nodes.length === 0) {
            console.warn('🗺️ [MindmapView] No nodes to render');
            // Clear existing visualization
            if (this.linkElements) this.linkElements.selectAll('*').remove();
            if (this.nodeElements) this.nodeElements.selectAll('*').remove();
            if (this.simulation) {
                this.simulation.stop();
                this.simulation = null;
            }
            return;
        }

        // Stop and clear existing simulation
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }

        // Clear existing nodes and edges
        if (this.linkElements) {
            this.linkElements.selectAll('.link').remove();
        }
        if (this.nodeElements) {
            this.nodeElements.selectAll('.node-group').remove();
        }

        // Filter nodes based on expanded state
        const visibleNodes = this.getVisibleNodes(nodes);
        const visibleEdges = this.getVisibleEdges(edges, visibleNodes);

        // Update simulation with properly resolved edges
        this.updateSimulation(visibleNodes, visibleEdges);

        // Render links (after simulation is set up, so edges have source/target objects)
        this.renderLinks(visibleEdges);

        // Render nodes
        this.renderNodes(visibleNodes);
        
        // Expand container if mindmap needs more space
        this.adjustContainerSize(visibleNodes, visibleEdges);
    }
    
    adjustContainerSize(nodes, edges) {
        if (!nodes || nodes.length === 0) return;
        
        const container = this.shadowRoot.querySelector('.mindmap-container');
        if (!container) return;
        
        // Calculate required dimensions based on node positions
        // Check multiple times as simulation settles
        let checkCount = 0;
        const maxChecks = 10; // Check for up to 5 seconds (10 * 500ms)
        
        const checkAndExpand = () => {
            if (!this.svg || !this.simulation) {
                if (checkCount < maxChecks) {
                    checkCount++;
                    setTimeout(checkAndExpand, 500);
                }
                return;
            }
            
            const svgNode = this.svg.node();
            if (!svgNode) {
                if (checkCount < maxChecks) {
                    checkCount++;
                    setTimeout(checkAndExpand, 500);
                }
                return;
            }
            
            // Get current SVG dimensions
            const currentWidth = parseFloat(svgNode.getAttribute('width')) || 568;
            const currentHeight = parseFloat(svgNode.getAttribute('height')) || 192;
            
            // Calculate bounding box of all nodes
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let hasValidNodes = false;
            
            nodes.forEach(node => {
                if (node.x !== undefined && node.y !== undefined && 
                    !isNaN(node.x) && !isNaN(node.y) &&
                    isFinite(node.x) && isFinite(node.y)) {
                    hasValidNodes = true;
                    // Use dynamic size calculation
                    const totalNodes = nodes.length;
                    const baseSize = 20;
                    const scaleFactor = Math.max(0.5, 1 - Math.log10(totalNodes) * 0.15);
                    const dynamicSize = Math.max(12, Math.min(25, baseSize * scaleFactor));
                    const levelScale = 1 - ((node.level || 1) - 1) * 0.1;
                    const radius = Math.max(12, dynamicSize * levelScale);
                    
                    minX = Math.min(minX, node.x - radius);
                    maxX = Math.max(maxX, node.x + radius);
                    minY = Math.min(minY, node.y - radius);
                    maxY = Math.max(maxY, node.y + radius);
                }
            });
            
            if (!hasValidNodes) {
                // Nodes haven't settled yet, check again
                if (checkCount < maxChecks) {
                    checkCount++;
                    setTimeout(checkAndExpand, 500);
                }
                return;
            }
            
            // Add padding (60px on each side for better visibility)
            const padding = 60;
            const requiredWidth = (maxX - minX) + (padding * 2);
            const requiredHeight = (maxY - minY) + (padding * 2);
            
            // Update SVG size if needed (but keep minimum of 600x220)
            // Expand primarily in height, keep width closer to 600
            const newWidth = Math.max(requiredWidth, 568);
            const newHeight = Math.max(requiredHeight, 192);
            
            // Only expand, don't shrink (to avoid flickering)
            // Keep width closer to original, expand height more
            const finalWidth = Math.max(newWidth, Math.min(currentWidth, 700)); // Cap width expansion
            const finalHeight = Math.max(newHeight, currentHeight); // Expand height freely
            
            if (finalWidth > currentWidth || finalHeight > currentHeight) {
                this.svg.attr('width', finalWidth).attr('height', finalHeight);
                
                // Update container height to match
                const containerHeight = finalHeight + 28; // Add padding
                container.style.height = `${containerHeight}px`;
                container.style.width = `${finalWidth + 32}px`; // Add horizontal padding
                
                // Update simulation center and restart
                if (this.simulation) {
                    this.simulation.force('center', d3.forceCenter(finalWidth / 2, finalHeight / 2));
                    this.simulation.alpha(0.5).restart();
                }
                
                console.log(`🗺️ [MindmapView] Expanded container to ${finalWidth}x${finalHeight} (from ${currentWidth}x${currentHeight})`);
                
                // Check again after expansion to see if more space is needed
                if (checkCount < maxChecks) {
                    checkCount++;
                    setTimeout(checkAndExpand, 1000);
                }
            } else if (checkCount < maxChecks) {
                // No expansion needed, but check once more to be sure
                checkCount++;
                setTimeout(checkAndExpand, 1000);
            }
        };
        
        // Start checking after initial simulation tick
        setTimeout(checkAndExpand, 500);
    }

    getVisibleNodes(allNodes) {
        if (!allNodes || allNodes.length === 0) return [];
        
        // For now, show ALL nodes (we'll add expand/collapse later if needed)
        // This ensures all nodes and their connections are visible
        console.log(`🗺️ [MindmapView] Showing all ${allNodes.length} nodes`);
        return allNodes;
        
        // TODO: Re-enable expand/collapse if needed
        /*
        if (this.expandedNodes.size === 0) {
            // Show only root nodes (level 1 or nodes with no incoming edges)
            const rootNodes = allNodes.filter(node => 
                node.level === 1 || 
                !this.mindmapData.edges.some(e => e.to === node.id)
            );
            console.log(`🗺️ [MindmapView] Showing ${rootNodes.length} root nodes (no expansions)`);
            return rootNodes;
        }

        // Show expanded nodes and their children
        const visible = new Set();
        this.expandedNodes.forEach(nodeId => {
            visible.add(nodeId);
            // Add direct children (nodes connected by edges from this node)
            this.mindmapData.edges
                .filter(e => e.from === nodeId)
                .forEach(e => visible.add(e.to));
        });

        // Always include root nodes
        allNodes
            .filter(node => node.level === 1)
            .forEach(node => visible.add(node.id));

        const visibleNodes = allNodes.filter(node => visible.has(node.id));
        console.log(`🗺️ [MindmapView] Showing ${visibleNodes.length} visible nodes (${this.expandedNodes.size} expanded)`);
        return visibleNodes;
        */
    }

    getVisibleEdges(allEdges, visibleNodes) {
        if (!allEdges || allEdges.length === 0) return [];
        if (!visibleNodes || visibleNodes.length === 0) return [];
        
        // Show all edges between visible nodes
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
        const visibleEdges = allEdges.filter(e => 
            visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)
        );
        console.log(`🗺️ [MindmapView] Showing ${visibleEdges.length} edges connecting ${visibleNodes.length} nodes`);
        return visibleEdges;
    }

    updateSimulation(nodes, edges) {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }

        const svgNode = this.svg.node();
        if (!svgNode) return;
        
        const width = parseFloat(svgNode.getAttribute('width')) || svgNode.clientWidth || 568;
        const height = parseFloat(svgNode.getAttribute('height')) || svgNode.clientHeight || 192;

        // Resolve edge source/target from string IDs to node objects
        const resolvedEdges = edges.map(edge => {
            const sourceNode = nodes.find(n => n.id === edge.from);
            const targetNode = nodes.find(n => n.id === edge.to);
            
            if (!sourceNode || !targetNode) {
                console.warn(`🗺️ [MindmapView] Edge ${edge.id} has invalid source or target:`, {
                    from: edge.from,
                    to: edge.to,
                    sourceFound: !!sourceNode,
                    targetFound: !!targetNode
                });
                return null;
            }
            
            return {
                ...edge,
                source: sourceNode,
                target: targetNode
            };
        }).filter(edge => edge !== null); // Remove invalid edges

        console.log(`🗺️ [MindmapView] Resolved ${resolvedEdges.length} valid edges from ${edges.length} total`);

        // Create force simulation with resolved edges
        this.simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(resolvedEdges)
                .id(d => d.id)
                .distance(d => {
                    // Adjust distance based on level and node size
                    const fromNode = typeof d.source === 'object' ? d.source : nodes.find(n => n.id === d.source);
                    const toNode = typeof d.target === 'object' ? d.target : nodes.find(n => n.id === d.target);
                    const fromLevel = fromNode?.level || 1;
                    const toLevel = toNode?.level || 1;
                    const levelDiff = Math.abs(fromLevel - toLevel);
                    
                    // Base distance: closer for hierarchical (parent-child), farther for same level
                    if (levelDiff === 1) {
                        return 80; // Parent to child: closer
                    } else if (levelDiff === 0) {
                        return 100; // Same level: medium
                    } else {
                        return 120 + (levelDiff * 20); // Different levels: farther
                    }
                })
                .strength(0.8) // Stronger links to keep connections visible
            )
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => {
                // Use dynamic size calculation based on visible nodes
                const visibleNodeCount = nodes.length;
                const baseSize = 20;
                const scaleFactor = Math.max(0.5, 1 - Math.log10(Math.max(1, visibleNodeCount)) * 0.15);
                const dynamicSize = Math.max(12, Math.min(25, baseSize * scaleFactor));
                const levelScale = 1 - ((d.level || 1) - 1) * 0.1;
                const radius = Math.max(12, dynamicSize * levelScale);
                return radius + 8; // Add padding for collision
            }));

        // Update positions on tick
        this.simulation.on('tick', () => {
            this.updatePositions();
        });

        // Start simulation
        this.simulation.alpha(1).restart();
    }

    renderLinks(edges) {
        if (!this.linkElements) {
            console.warn('🗺️ [MindmapView] linkElements not initialized');
            return;
        }

        // Get edges from simulation (they now have source/target as objects)
        const simulationEdges = this.simulation ? this.simulation.force('link').links() : [];
        
        const link = this.linkElements
            .selectAll('.link')
            .data(simulationEdges, d => {
                // Use node IDs for key
                const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                return `${sourceId}-${targetId}`;
            });

        // Remove old links
        link.exit().remove();

        // Add new links
        const linkEnter = link.enter()
            .append('line')
            .attr('class', 'link')
            .attr('stroke', d => d.color || 'rgba(255, 255, 255, 0.3)')
            .attr('stroke-width', 1.5);

        // Merge and update
        linkEnter.merge(link);
    }

    renderNodes(nodes) {
        // Calculate dynamic node size based on VISIBLE nodes (when branch expands)
        // More visible nodes = smaller size to fit better
        const visibleNodeCount = nodes.length;
        const baseSize = 20;
        const minSize = 12;
        const maxSize = 25;
        
        // Scale factor: nodes get smaller as visible count increases
        // Formula: size decreases logarithmically with visible node count
        const scaleFactor = Math.max(0.5, 1 - Math.log10(Math.max(1, visibleNodeCount)) * 0.15);
        const dynamicBaseSize = Math.max(minSize, Math.min(maxSize, baseSize * scaleFactor));
        
        console.log(`🗺️ [MindmapView] Rendering ${visibleNodeCount} visible nodes with base size ${dynamicBaseSize.toFixed(1)}`);

        const node = this.nodeElements
            .selectAll('.node-group')
            .data(nodes, d => d.id);

        node.exit().remove();

        const nodeEnter = node.enter()
            .append('g')
            .attr('class', 'node-group')
            .call(this.drag());

        // Add circle with dynamic size
        nodeEnter.append('circle')
            .attr('class', d => `node ${this.expandedNodes.has(d.id) ? 'expanded' : ''}`)
            .attr('r', d => {
                // Use node's size if provided, otherwise use dynamic base size
                const nodeSize = d.size || dynamicBaseSize;
                // Scale based on level (higher level = slightly smaller)
                const levelScale = 1 - ((d.level || 1) - 1) * 0.1;
                return Math.max(minSize, nodeSize * levelScale);
            })
            .attr('fill', d => d.color || '#4A90E2')
            .attr('stroke', 'white')
            .attr('stroke-width', 1.5)
            .on('click', (event, d) => this.handleNodeClick(event, d));

        // Add label INSIDE the node (centered)
        const fontSize = Math.max(9, 11 * scaleFactor);
        nodeEnter.append('text')
            .attr('class', 'node-label')
            .attr('dy', '0.35em') // Center vertically in the circle
            .attr('text-anchor', 'middle') // Center horizontally
            .attr('font-size', `${fontSize}px`)
            .attr('fill', 'white')
            .attr('font-weight', '500')
            .text(d => {
                const label = d.label || '';
                // Adjust label length based on node count and node size
                const nodeSize = d.size || dynamicBaseSize;
                const levelScale = 1 - ((d.level || 1) - 1) * 0.1;
                const radius = Math.max(minSize, nodeSize * levelScale);
                // Estimate max characters that fit (roughly 1 char per 3-4px)
                const maxChars = Math.floor((radius * 2) / 4);
                const maxLength = Math.max(5, Math.min(maxChars, visibleNodeCount > 20 ? 8 : (visibleNodeCount > 10 ? 10 : 12)));
                return label.length > maxLength ? label.substring(0, maxLength - 3) + '...' : label;
            });

        // Update existing nodes
        const nodeUpdate = nodeEnter.merge(node);
        nodeUpdate.select('circle')
            .attr('class', d => `node ${this.expandedNodes.has(d.id) ? 'expanded' : ''}`)
            .attr('fill', d => d.color || '#4A90E2')
            .attr('r', d => {
                const nodeSize = d.size || dynamicBaseSize;
                const levelScale = 1 - ((d.level || 1) - 1) * 0.1;
                return Math.max(minSize, nodeSize * levelScale);
            });
        
        nodeUpdate.select('text')
            .attr('font-size', `${fontSize}px`)
            .attr('dy', '0.35em') // Center vertically
            .attr('text-anchor', 'middle') // Center horizontally
            .attr('fill', 'white')
            .text(d => {
                const label = d.label || '';
                const nodeSize = d.size || dynamicBaseSize;
                const levelScale = 1 - ((d.level || 1) - 1) * 0.1;
                const radius = Math.max(minSize, nodeSize * levelScale);
                const maxChars = Math.floor((radius * 2) / 4);
                const maxLength = Math.max(5, Math.min(maxChars, visibleNodeCount > 20 ? 8 : (visibleNodeCount > 10 ? 10 : 12)));
                return label.length > maxLength ? label.substring(0, maxLength - 3) + '...' : label;
            });

        // Store reference for simulation
        this.nodeElements = nodeUpdate;
    }

    updatePositions() {
        if (!this.linkElements || !this.nodeElements) return;

        // Update link positions from simulation (edges now have source/target as objects)
        this.linkElements.selectAll('.link')
            .attr('x1', d => {
                const source = typeof d.source === 'object' ? d.source : null;
                return source?.x || 0;
            })
            .attr('y1', d => {
                const source = typeof d.source === 'object' ? d.source : null;
                return source?.y || 0;
            })
            .attr('x2', d => {
                const target = typeof d.target === 'object' ? d.target : null;
                return target?.x || 0;
            })
            .attr('y2', d => {
                const target = typeof d.target === 'object' ? d.target : null;
                return target?.y || 0;
            });

        // Update node positions
        this.nodeElements
            .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    }

    handleNodeClick(event, node) {
        event.stopPropagation();
        
        if (this.expandedNodes.has(node.id)) {
            // Collapse
            this.expandedNodes.delete(node.id);
        } else {
            // Expand
            this.expandedNodes.add(node.id);
        }

        // Re-render with new visibility
        this.renderMindmap();
    }

    drag() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }

    resetZoom() {
        if (this.svg && this.zoom) {
            this.svg.transition()
                .duration(750)
                .call(this.zoom.transform, d3.zoomIdentity);
        }
    }

    resetExpanded() {
        this.expandedNodes.clear();
        if (this.mindmapData) {
            this.renderMindmap();
        }
    }

    render() {
        if (!this.isVisible) {
            return html`<div style="display: none;"></div>`;
        }

        const hasData = this.mindmapData && 
                       this.mindmapData.nodes && 
                       this.mindmapData.nodes.length > 0;

        return html`
            <div class="mindmap-container">
                ${!hasData
                    ? html`<div class="empty-state">No mindmap yet...</div>`
                    : html`
                        <svg class="mindmap-svg" style="display: block; width: 100%; height: 100%;"></svg>
                        <div class="controls">
                            <button class="control-button" @click=${this.resetZoom}>Reset Zoom</button>
                            <button class="control-button" @click=${this.resetExpanded}>Collapse All</button>
                        </div>
                    `}
            </div>
        `;
    }
}

customElements.define('mindmap-view', MindmapView);

