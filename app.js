/* WSN Simulation Engine — UI & Visualization */

// Elements
const canvas = document.getElementById('networkCanvas');
const ctx = canvas.getContext('2d');
const logEl = document.getElementById('consoleLog');

// Global Charts
let energyChart, fitnessChart, aliveNodesChart, costChart;
let compEnergyChart, compCostChart, compFitnessChart, compAliveChart;
let fixedNodes = []; // Deep copy of nodes for fixed simulation

// Energy table pagination state
let energyTableCurrentPage = 0;
const ENERGY_PAGE_SIZE = 50;
let energyTableFilter = '';

// Configuration getters
const getCfg = () => ({
    n: parseInt(document.getElementById('numNodes').value),
    area: parseInt(document.getElementById('areaSize').value),
    range: parseInt(document.getElementById('commRange').value),
    ch: parseInt(document.getElementById('numCH').value),
    rounds: parseInt(document.getElementById('numRounds').value),
    energy: parseFloat(document.getElementById('energyPerHop').value) / 1000,
    bsX: parseFloat(document.getElementById('bsX').value),
    bsY: parseFloat(document.getElementById('bsY').value),
    trafficLevel: document.getElementById('trafficLevel').value,
    energyMode: document.getElementById('energyMode').value,
    uniformEnergy: parseFloat(document.getElementById('uniformEnergy').value) || 0.5
});

// Update range labels
function updateLabel(el) {
    document.getElementById(el.id + '_val').innerText = el.value;
    if (el.id === 'areaSize') {
        document.getElementById('bsX').value = el.value;
        document.getElementById('bsY').value = el.value;
    }
}

// Energy mode change handler
function onEnergyModeChange() {
    const mode = document.getElementById('energyMode').value;
    const uniformGroup = document.getElementById('uniformEnergyGroup');
    const applyBtn = document.getElementById('btnApplyEnergy');

    uniformGroup.style.display = mode === 'uniform' ? 'block' : 'none';
    applyBtn.style.display = mode === 'custom' ? 'inline-block' : 'none';

    // If nodes are deployed and mode isn't custom, apply the preset
    if (nodes.length > 0 && mode !== 'custom') {
        const c = getCfg();
        applyEnergyPreset(mode, c.uniformEnergy, c.bsX, c.bsY, c.area);
        updateNetworkStats();
        renderEnergyTable();
        drawCanvas();
        log(`Applied "${mode}" energy mode to ${nodes.length} nodes`, 'success');
    }

    // Show energy table for custom mode
    if (mode === 'custom' && nodes.length > 0) {
        document.getElementById('energyTableCard').style.display = 'block';
        renderEnergyTable();
    }
}

// Apply default energies (smart defaults)
function applyDefaultEnergies() {
    if (nodes.length === 0) {
        log('Deploy nodes first before setting energies.', 'warn');
        return;
    }

    const c = getCfg();
    applyEnergyPreset('distance', 0.5, c.bsX, c.bsY, c.area);
    document.getElementById('energyMode').value = 'distance';
    onEnergyModeChange();
    updateNetworkStats();
    renderEnergyTable();
    drawCanvas();
    log('Applied smart default energies (Distance-Based: 0.3–0.7 J)', 'success');
}

// Apply custom energies from the table
function applyCustomEnergies() {
    if (nodes.length === 0) return;

    const energies = [];
    nodes.forEach(n => {
        const input = document.getElementById(`nodeEnergy_${n.id}`);
        if (input) {
            energies.push({ id: n.id, energy: parseFloat(input.value) || 0.5 });
        } else {
            energies.push({ id: n.id, energy: n.energy });
        }
    });

    setNodeEnergies(energies);
    updateNetworkStats();
    drawCanvas();
    log(`Applied custom energies to ${energies.length} nodes`, 'success');
}

// Logging
function log(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `log-entry log-${type}`;
    el.innerHTML = `> ${msg}`;
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
}

// View toggle
function setView(v) {
    currentView = v;
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(v === 'all' ? 'viewAll' : 'viewPath').classList.add('active');
    drawCanvas();
}

// Coordinate mapping
function mapCoord(x, y, area) {
    const padding = 40;
    const cw = canvas.width - padding * 2;
    const ch = canvas.height - padding * 2;
    return {
        x: padding + (x / area) * cw,
        y: canvas.height - (padding + (y / area) * ch)
    };
}

// Reset
function resetAll() {
    nodes = []; fixedNodes = []; chIds = []; clusters = {}; bestResult = null; 
    roundHistory = []; fixedRoundHistory = [];
    document.getElementById('btnOptimize').disabled = true;
    document.getElementById('btnSimulate').disabled = true;
    document.getElementById('btnCompare').disabled = true;
    document.getElementById('btnCompare').style.display = 'none';
    document.querySelectorAll('.result-card').forEach(c => {
        if (c.id !== '') c.style.display = 'none';
    });
    logEl.innerHTML = '<div class="log-entry log-info">System reset.</div>';
    document.getElementById('statusBadge').innerText = 'Ready';
    document.getElementById('statusBadge').className = 'badge';
    document.getElementById('networkStats').style.display = 'none';
    document.getElementById('energyTableCard').style.display = 'none';
    document.getElementById('graphsContainer').style.display = 'none';
    document.getElementById('comparisonContainer').style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Network stats update
function updateNetworkStats() {
    const stats = getNetworkStats();
    if (!stats) return;

    document.getElementById('networkStats').style.display = 'flex';
    document.getElementById('statTotal').innerText = stats.total;
    document.getElementById('statAlive').innerText = stats.alive;
    document.getElementById('statDead').innerText = stats.dead;
    document.getElementById('statAvgEnergy').innerText = stats.avgEnergy.toFixed(3) + ' J';
    document.getElementById('statTotalEnergy').innerText = stats.totalEnergy.toFixed(2) + ' J';
    document.getElementById('statDensity').innerText = stats.density + ' avg';
}

// Energy table rendering with pagination
function renderEnergyTable() {
    if (nodes.length === 0) return;

    const card = document.getElementById('energyTableCard');
    const mode = document.getElementById('energyMode').value;
    card.style.display = 'block';

    let filtered = nodes;
    if (energyTableFilter) {
        filtered = nodes.filter(n => String(n.id).includes(energyTableFilter));
    }

    const totalPages = Math.ceil(filtered.length / ENERGY_PAGE_SIZE) || 1;
    if (energyTableCurrentPage >= totalPages) energyTableCurrentPage = totalPages - 1;
    if (energyTableCurrentPage < 0) energyTableCurrentPage = 0;

    const start = energyTableCurrentPage * ENERGY_PAGE_SIZE;
    const pageNodes = filtered.slice(start, start + ENERGY_PAGE_SIZE);
    const isCustom = mode === 'custom';

    let html = `<table class="result-table energy-table">
        <tr><th>ID</th><th>X</th><th>Y</th><th>Energy (J)</th><th>Status</th></tr>`;

    pageNodes.forEach(n => {
        const status = n.alive
            ? `<span style="color:var(--green)">●</span>`
            : `<span style="color:var(--red)">✖</span>`; // explicit dead marker

        const energyCell = isCustom
            ? `<input type="number" id="nodeEnergy_${n.id}" class="energy-cell-input" value="${n.energy.toFixed(3)}" step="0.01" min="0" max="2.0">`
            : `<span class="energy-cell-value">${n.energy.toFixed(3)}</span>`;

        html += `<tr>
            <td>N${n.id}</td>
            <td>${n.x.toFixed(1)}</td>
            <td>${n.y.toFixed(1)}</td>
            <td>${energyCell}</td>
            <td>${status}</td>
        </tr>`;
    });

    html += '</table>';
    document.getElementById('energyTableBody').innerHTML = html;
    document.getElementById('energyPageInfo').innerText = `Page ${energyTableCurrentPage + 1}/${totalPages} (${filtered.length} nodes)`;
}

function energyTablePage(dir) {
    let filtered = nodes;
    if (energyTableFilter) {
        filtered = nodes.filter(n => String(n.id).includes(energyTableFilter));
    }
    const totalPages = Math.ceil(filtered.length / ENERGY_PAGE_SIZE) || 1;
    energyTableCurrentPage += dir;
    if (energyTableCurrentPage < 0) energyTableCurrentPage = 0;
    if (energyTableCurrentPage >= totalPages) energyTableCurrentPage = totalPages - 1;
    renderEnergyTable();
}

function filterEnergyTable() {
    energyTableFilter = document.getElementById('energySearch').value.trim();
    energyTableCurrentPage = 0;
    renderEnergyTable();
}

// 1. Deploy Nodes
function deployNetwork() {
    const c = getCfg();
    deployNodes(c.n, c.area, c.range, c.energyMode, c.uniformEnergy, c.bsX, c.bsY);
    
    // Deep copy for Fixed Simulation tracking
    fixedNodes = JSON.parse(JSON.stringify(nodes));

    log(`Deployed ${c.n} nodes in ${c.area}x${c.area}m area`, 'success');
    log(`Communication range: ${c.range}m | Energy mode: ${c.energyMode}`);
    
    document.getElementById('btnOptimize').disabled = false;
    document.getElementById('btnSimulate').disabled = false;
    document.getElementById('btnCompare').disabled = false;
    document.getElementById('btnCompare').style.display = 'block';
    document.getElementById('statusBadge').innerText = 'Deployed';
    document.getElementById('statusBadge').className = 'badge done';

    chIds = []; clusters = {}; bestResult = null;
    setView('all');
    updateNetworkStats();
    energyTableCurrentPage = 0;
    renderEnergyTable();
    onEnergyModeChange();
    
    // Compute initial optimal cluster head count
    let initCH = calculateOptimalCH(nodes, c.bsX, c.bsY, c.area);
    document.getElementById('numCH').value = initCH;
    document.getElementById('numCH_val').innerText = `Auto (${initCH})`;
    
    // Initialize framework UI view
    onFrameworkChange();
    
    document.getElementById('graphsContainer').style.display = 'none';
    document.getElementById('comparisonContainer').style.display = 'none';
}

// Visual Flow Execution
function setFlowState(stepId) {
    document.querySelectorAll('.flow-step').forEach(el => el.classList.remove('active', 'done'));
    const steps = ['flow-tdo', 'flow-cmto', 'flow-amgso', 'flow-fitness', 'flow-optimal'];
    let reached = false;
    steps.forEach(id => {
        let el = document.getElementById(id);
        if (id === stepId) {
            el.classList.add('active');
            reached = true;
        } else if (!reached) {
            el.classList.add('done');
        }
    });
}

// 2. Single Round Optimization (with animation)
function runOptimization() {
    const c = getCfg();
    let alive = nodes.filter(n => n.alive).length;
    if (alive < 3) {
        log('Network is dead. Cannot optimize.', 'warn');
        return;
    }

    const framework = document.getElementById('routingFramework').value;

    log(`[ROUND] Running optimization...`, 'step');
    document.getElementById('statusBadge').innerText = 'Running...';
    document.getElementById('statusBadge').className = 'badge running';
    document.getElementById('executionFlowCard').style.display = 'block';

    // --- AI AGENT LAYER ---
    const stats = getNetworkStats();
    let networkState = {
        nodes: c.n,
        trafficLevel: c.trafficLevel,
        areaSize: c.area,
        avgEnergy: stats ? stats.avgEnergy : 0.5,
        maxEnergy: nodes.length > 0 ? nodes[0].maxEnergy : 0.5,
        deadNodes: stats ? stats.dead : 0,
        density: stats ? parseFloat(stats.density) : 0
    };
    
    // Call the intelligent agent
    let agentDecision = wsnAgent.analyzeAndDecide(networkState, nodes, c.bsX, c.bsY);
    log(`[AI AGENT] Analyzed network. Priority: ${agentDecision.priority}`, 'step');
    
    let activeFramework = framework === 'agent' ? agentDecision.framework : framework;
    log(`[AI AGENT] Selected Framework: ${activeFramework === 'ai' ? 'AI-Based (PSO+ACO)' : 'Traditional (TDO+CMTO+AMGSO)'} based on traffic level (${c.trafficLevel})`, 'step');

    // Show/hide correct panels based on activeFramework and framework selection
    document.getElementById('traditionalActiveCard').style.display = 'none';
    document.getElementById('aiActiveCard').style.display = 'none';
    document.getElementById('aiAgentReportCard').style.display = 'none';
    document.getElementById('aiAgentCard').style.display = 'none';

    if (activeFramework === 'traditional') {
        document.getElementById('traditionalActiveCard').style.display = 'block';
        document.getElementById('aiAgentCard').style.display = 'block';
        document.getElementById('aiReasonText').innerText = agentDecision.reason;
        document.getElementById('aiPriority').innerText = agentDecision.priority;
        document.getElementById('aiCHStrategy').innerText = agentDecision.chStrategy;
        document.getElementById('aiRoutingStrategy').innerText = agentDecision.routingStrategy;
        
        // Update execution flow step labels
        document.getElementById('flow-tdo').innerHTML = '<span class="flow-icon">1</span><div class="flow-text"><strong>TDO</strong> <br>CH Selection</div>';
        document.getElementById('flow-cmto').innerHTML = '<span class="flow-icon">2</span><div class="flow-text"><strong>CMTO</strong> <br>Candidate Paths</div>';
        document.getElementById('flow-amgso').innerHTML = '<span class="flow-icon">3</span><div class="flow-text"><strong>AMGSO</strong> <br>Dead Nodes Excluded</div>';
    } else {
        document.getElementById('aiActiveCard').style.display = 'block';
        document.getElementById('aiAgentReportCard').style.display = 'block';
        
        document.getElementById('repNodes').innerText = networkState.nodes;
        document.getElementById('repTraffic').innerText = networkState.trafficLevel;
        document.getElementById('repEnergy').innerText = networkState.avgEnergy.toFixed(3) + ' J';
        document.getElementById('repDensity').innerText = networkState.density;
        document.getElementById('repDead').innerText = networkState.deadNodes;
        document.getElementById('repWeightAlpha').innerText = agentDecision.weights.a.toFixed(2);
        document.getElementById('repWeightBeta').innerText = agentDecision.weights.b.toFixed(2);
        document.getElementById('repWeightGamma').innerText = agentDecision.weights.g.toFixed(2);
        document.getElementById('repWeightDelta').innerText = agentDecision.weights.d.toFixed(2);
        document.getElementById('repReason').innerText = agentDecision.reason;
        document.getElementById('repRoutingPriority').innerText = agentDecision.priority;
        document.getElementById('repPriorityActive').innerText = `✓ ${agentDecision.priority} Activated`;
        
        // Update execution flow step labels
        document.getElementById('flow-tdo').innerHTML = '<span class="flow-icon">1</span><div class="flow-text"><strong>PSO</strong> <br>CH Selection</div>';
        document.getElementById('flow-cmto').innerHTML = '<span class="flow-icon">2</span><div class="flow-text"><strong>ACO</strong> <br>Optimal Paths</div>';
        document.getElementById('flow-amgso').innerHTML = '<span class="flow-icon">3</span><div class="flow-text"><strong>AI Agent</strong> <br>Weights Selected</div>';
    }

    // Get optimal CH count from agent decision
    let optimalCHCount = agentDecision.optimalCHCount;
    document.getElementById('numCH').value = optimalCHCount;
    document.getElementById('numCH_val').innerText = `Auto (${optimalCHCount})`;

    // Step 1: Cluster Head Selection (TDO, PSO or Fitness-Based)
    setFlowState('flow-tdo');
    let selectedCH;
    if (activeFramework === 'traditional') {
        if (agentDecision && agentDecision.chStrategy === 'Energy-Based CH') {
            selectedCH = fitnessSelectCH(c.bsX, c.bsY, optimalCHCount);
            log(`[AI Agent] Selected Energy-Based Fitness CH selection (${selectedCH.length} CHs)`);
        } else {
            selectedCH = tdoSelectCH(c.bsX, c.bsY, optimalCHCount, c.range);
            log(`[TDO] Selected ${selectedCH.length} Cluster Heads (Optimal count calculated: ${optimalCHCount})`);
        }
    } else {
        selectedCH = psoSelectCH(c.bsX, c.bsY, optimalCHCount, c.range);
        log(`[PSO] Selected ${selectedCH.length} Cluster Heads (Optimal count calculated: ${optimalCHCount})`);
    }
    formClusters(selectedCH);

    // Update Decided Cluster Heads in Agent Summary Cards
    const chListStr = `${selectedCH.length} CHs: [${selectedCH.map(id => 'N' + id).join(', ')}]`;
    if (activeFramework === 'traditional') {
        document.getElementById('aiDecidedCHs').innerText = chListStr;
    } else {
        document.getElementById('repDecidedCHs').innerText = chListStr;
    }

    setTimeout(() => {
        // Step 2: Path Generation / Finding (CMTO or ACO)
        setFlowState('flow-cmto');
        let cPaths;
        if (activeFramework === 'traditional') {
            cPaths = cmtoGenerate(selectedCH, c.bsX, c.bsY);
            log(`[CMTO] Generated candidate paths`);
        } else {
            cPaths = acoRoute(selectedCH, c.bsX, c.bsY);
            log(`[ACO] Calculated optimal paths`);
        }

        setTimeout(() => {
            // Step 3: Routing Optimization (AMGSO or AI Agent weights application)
            setFlowState('flow-amgso');
            let oPaths;
            if (activeFramework === 'traditional') {
                oPaths = amgsoRoute(cPaths);
                log(`[AMGSO] Refined paths and excluded dead nodes`, 'amgso');
            } else {
                oPaths = cPaths; // ACO directly finds the optimal path
                log(`[AI Agent] Dynamic weights applied`, 'amgso');
            }

            setTimeout(() => {
                // Step 4: Fitness
                setFlowState('flow-fitness');
                let results = selectBestPaths(oPaths, c.bsX, c.bsY, false, agentDecision); 
                let alts = getPathAlternatives(oPaths, c.bsX, c.bsY, agentDecision);
                log(`[Fitness] Evaluated paths using weights`);

                setTimeout(() => {
                    // Step 5: Optimal
                    setFlowState('flow-optimal');
                    if (Object.keys(results).length === 0) {
                        log('No viable paths found.', 'warn');
                        document.getElementById('statusBadge').innerText = 'Failed';
                        return;
                    }

                    let bestCh = Object.keys(results).reduce((a, b) => results[a].fitness > results[b].fitness ? a : b);
                    bestResult = results[bestCh];
                    bestResult.chId = bestCh;

                    log(`[BEST] Path via CH ${bestCh} | Fitness: ${bestResult.fitness.toFixed(4)}`, 'result');

                    // Update UI
                    updateResultsUI(bestResult, selectedCH, alts);
                    updateNetworkStats();
                    setView('path');

                    document.getElementById('statusBadge').innerText = 'Optimized';
                    document.getElementById('statusBadge').className = 'badge done';
                }, 600);
            }, 600);
        }, 600);
    }, 600);
}

// Fixed node helper functions
function applyFixedWeightRouting(chList, bsX, bsY, c) {
    // We run the logic on fixedNodes
    let cPaths = {};
    chList.forEach(cid => {
        let paths = [];
        let path = [cid];
        let curr = fixedNodes[cid];
        if(!curr.alive) return;
        
        let visited = new Set([cid]);
        for (let i = 0; i < 3; i++) {
            let dToBS = dist(curr.x, curr.y, bsX, bsY);
            let closer = chList.filter(id => {
                if (visited.has(id)) return false;
                let ch = fixedNodes[id];
                return ch.alive && dist(ch.x, ch.y, bsX, bsY) < dToBS;
            });
            if (closer.length === 0) break;
            let next = closer[Math.floor(Math.random() * closer.length)];
            path.push(next);
            visited.add(next);
            curr = fixedNodes[next];
        }
        paths.push(path);
        cPaths[cid] = paths;
    });
    
    // Evaluate with Fixed Weights
    let best = null;
    for (let cid in cPaths) {
        cPaths[cid].forEach(p => {
            let e = 0, d = 0;
            for (let id of p) e += fixedNodes[id].energy;
            for (let i=0; i<p.length-1; i++) d += dist(fixedNodes[p[i]].x, fixedNodes[p[i]].y, fixedNodes[p[i+1]].x, fixedNodes[p[i+1]].y);
            d += dist(fixedNodes[p[p.length-1]].x, fixedNodes[p[p.length-1]].y, bsX, bsY);
            
            let cost = p.length;
            let qual = e / (d * cost);
            let f = (0.25 * (e/10)) + (0.25 * (100/d)) + (0.25 * (1/cost)) + (0.25 * qual); // Fixed weights
            
            if (!best || f > best.fitness) {
                best = {path: p, fitness: f, energy: e, distance: d, cost: cost};
            }
        });
    }
    
    if (best) {
        // Drain energy
        best.path.forEach(nid => {
            fixedNodes[nid].energy -= c.energy;
            if (fixedNodes[nid].energy <= 0) {
                fixedNodes[nid].energy = 0;
                fixedNodes[nid].alive = false;
            }
        });
    }
    return best;
}

// 3. Multi-Round Simulation
function runSimulation() {
    const c = getCfg();
    roundHistory = [];
    fixedRoundHistory = [];
    
    const framework = document.getElementById('routingFramework').value;
    
    log(`[SIM] Starting ${c.rounds} rounds of simulation...`, 'step');
    document.getElementById('statusBadge').innerText = 'Simulating...';
    document.getElementById('statusBadge').className = 'badge running';
    document.getElementById('btnDeploy').disabled = true;
    document.getElementById('btnOptimize').disabled = true;
    document.getElementById('btnSimulate').disabled = true;
    document.getElementById('btnCompare').disabled = true;
    document.getElementById('executionFlowCard').style.display = 'none';

    let currentRound = 0;

    function nextRound() {
        if (currentRound >= c.rounds) {
            log(`Simulation completed.`, 'success');
            finishSim();
            return;
        }
        currentRound++;

        let alive = nodes.filter(n => n.alive).length;
        if (alive < 3) {
            log(`Network dead at round ${currentRound}`, 'warn');
            finishSim();
            return;
        }

        // --- AI AGENT LAYER ---
        const stats = getNetworkStats();
        let networkState = {
            nodes: c.n,
            trafficLevel: c.trafficLevel,
            areaSize: c.area,
            avgEnergy: stats ? stats.avgEnergy : 0.5,
            maxEnergy: nodes.length > 0 ? nodes[0].maxEnergy : 0.5,
            deadNodes: stats ? stats.dead : 0,
            density: stats ? parseFloat(stats.density) : 0
        };
        let agentDecision = wsnAgent.analyzeAndDecide(networkState, nodes, c.bsX, c.bsY);
        let activeFramework = framework === 'agent' ? agentDecision.framework : framework;
        let optimalCHCount = agentDecision.optimalCHCount;

        // Cluster Head Selection (TDO, PSO or Fitness-Based)
        let selectedCH;
        if (activeFramework === 'traditional') {
            if (agentDecision && agentDecision.chStrategy === 'Energy-Based CH') {
                selectedCH = fitnessSelectCH(c.bsX, c.bsY, optimalCHCount);
            } else {
                selectedCH = tdoSelectCH(c.bsX, c.bsY, optimalCHCount, c.range);
            }
        } else {
            selectedCH = psoSelectCH(c.bsX, c.bsY, optimalCHCount, c.range);
        }
        formClusters(selectedCH);

        // Update Decided Cluster Heads in Agent Summary Cards
        const chListStr = `${selectedCH.length} CHs: [${selectedCH.map(id => 'N' + id).join(', ')}]`;
        if (activeFramework === 'traditional') {
            document.getElementById('aiDecidedCHs').innerText = chListStr;
        } else {
            document.getElementById('repDecidedCHs').innerText = chListStr;
        }

        // Routing (CMTO or ACO)
        let cPaths;
        if (activeFramework === 'traditional') {
            cPaths = cmtoGenerate(selectedCH, c.bsX, c.bsY);
        } else {
            cPaths = acoRoute(selectedCH, c.bsX, c.bsY);
        }

        // Routing Refinement (AMGSO or ACO paths directly)
        let oPaths;
        if (activeFramework === 'traditional') {
            oPaths = amgsoRoute(cPaths);
        } else {
            oPaths = cPaths;
        }

        // Selection
        let results = selectBestPaths(oPaths, c.bsX, c.bsY, false, agentDecision);
        if (Object.keys(results).length === 0) {
            log(`Round ${currentRound}: No paths found!`, 'warn');
            finishSim();
            return;
        }
        
        let bestCh = Object.keys(results).reduce((a, b) => results[a].fitness > results[b].fitness ? a : b);
        bestResult = results[bestCh];
        bestResult.chId = bestCh;

        // Drain energy
        let died = [];
        bestResult.path.forEach(nid => {
            nodes[nid].energy -= c.energy;
            if (nodes[nid].energy <= 0) {
                nodes[nid].energy = 0;
                nodes[nid].alive = false;
                died.push(nid);
            }
        });
        if (died.length) log(`Round ${currentRound}: Dead nodes: ${died.join(',')}`, 'amgso');

        roundHistory.push({
            round: currentRound,
            fitness: bestResult.fitness,
            energy: nodes.reduce((s,n) => s+n.energy, 0),
            cost: bestResult.cost,
            alive: alive
        });
        
        // Comparison (Fixed Weights)
        let fixedAlive = fixedNodes.filter(n => n.alive).length;
        let fixedBest = applyFixedWeightRouting(selectedCH, c.bsX, c.bsY, c);
        
        fixedRoundHistory.push({
            round: currentRound,
            fitness: fixedBest ? fixedBest.fitness : 0,
            energy: fixedNodes.reduce((s,n) => s+n.energy, 0),
            cost: fixedBest ? fixedBest.cost : 0,
            alive: fixedAlive
        });

        updateResultsUI(bestResult, selectedCH, getPathAlternatives(oPaths, c.bsX, c.bsY, agentDecision));
        updateNetworkStats();
        renderEnergyTable();
        setView('path');

        setTimeout(nextRound, 100);
    }

    nextRound();
}

function finishSim() {
    document.getElementById('btnDeploy').disabled = false;
    document.getElementById('btnOptimize').disabled = false;
    document.getElementById('btnSimulate').disabled = false;
    document.getElementById('btnCompare').disabled = false;
    document.getElementById('statusBadge').innerText = 'Completed';
    document.getElementById('statusBadge').className = 'badge done';
    
    drawGraphs();
    showSummaryModal();
}

function showSummaryModal() {
    let adpTotalE = roundHistory.length > 0 ? roundHistory[roundHistory.length-1].energy : 0;
    let fixTotalE = fixedRoundHistory.length > 0 ? fixedRoundHistory[fixedRoundHistory.length-1].energy : 0;
    
    // Calculate Energy Saved percentage
    let savedPct = 0;
    if (fixTotalE < adpTotalE && adpTotalE > 0) {
        let diff = adpTotalE - fixTotalE;
        savedPct = (diff / fixTotalE) * 100;
    }

    const c = getCfg();
    let alive = nodes.filter(n => n.alive).length;
    let dead = nodes.length - alive;

    document.getElementById('sumTotalNodes').innerText = nodes.length;
    document.getElementById('sumCH').innerText = c.ch;
    document.getElementById('sumAliveNodes').innerText = alive;
    document.getElementById('sumDeadNodes').innerText = dead;
    document.getElementById('sumBestFitness').innerText = bestResult ? bestResult.fitness.toFixed(4) : "N/A";
    document.getElementById('sumEnergySaved').innerText = `+${savedPct.toFixed(1)}%`;
    
    document.getElementById('summaryModal').style.display = 'flex';
}

function closeSummaryModal() {
    document.getElementById('summaryModal').style.display = 'none';
}

// ── UI Updates ──
function updateResultsUI(best, chList, alternatives) {
    document.getElementById('optimalCard').style.display = 'block';
    document.getElementById('weightsCard').style.display = 'block';

    // Path string
    let pStr = best.path.map(id => `<span class="path-node">N${id}</span>`).join(' <span class="path-arrow">&rarr;</span> ');
    pStr += ` <span class="path-arrow">&rarr;</span> <span class="path-node bs">BS</span>`;
    document.getElementById('pathDisplay').innerHTML = pStr;
    
    // Path Alternatives
    let altsHtml = '';
    alternatives.forEach((alt, idx) => {
        let isSelected = best.path.join(',') === alt.path.join(',');
        let pText = alt.path.map(id => `N${id}`).join('→') + '→BS';
        altsHtml += `<div class="alt-path ${isSelected ? 'selected' : ''}">
            <span>Path ${idx+1}: ${pText}</span>
            <span class="alt-path-score">Fitness: ${alt.fitness.toFixed(4)} ${isSelected ? '✅' : ''}</span>
        </div>`;
    });
    document.getElementById('pathAlternativesDisplay').innerHTML = altsHtml;

    // Params grid
    document.getElementById('paramsGrid').innerHTML = `
        <div class="param-item"><div class="param-label">Fitness</div><div class="param-value fitness">${best.fitness.toFixed(4)}</div></div>
        <div class="param-item"><div class="param-label">Energy (J)</div><div class="param-value energy">${best.energy.toFixed(4)}</div></div>
        <div class="param-item"><div class="param-label">Distance (m)</div><div class="param-value distance">${best.distance.toFixed(1)}</div></div>
        <div class="param-item"><div class="param-label">Cost (Hops)</div><div class="param-value cost">${best.cost}</div></div>
        <div class="param-item"><div class="param-label">Quality</div><div class="param-value quality">${best.quality.toFixed(4)}</div></div>
        <div class="param-item"><div class="param-label">Heuristic</div><div class="param-value heuristic">${best.heuristic.toFixed(4)}</div></div>
    `;

    // Weights
    let w = best.weights;
    document.getElementById('weightsScenario').innerText = best.scenario;
    document.getElementById('weightsDisplay').innerHTML = `
        <div class="weight-bar-group">
            <div class="weight-label"><span>Energy (&alpha;)</span><span>${(w.a*100).toFixed(1)}%</span></div>
            <div class="weight-bar"><div class="weight-fill" style="width:${w.a*100}%; background:var(--green)"></div></div>
        </div>
        <div class="weight-bar-group">
            <div class="weight-label"><span>Distance (&beta;)</span><span>${(w.b*100).toFixed(1)}%</span></div>
            <div class="weight-bar"><div class="weight-fill" style="width:${w.b*100}%; background:var(--orange)"></div></div>
        </div>
        <div class="weight-bar-group">
            <div class="weight-label"><span>Cost (&gamma;)</span><span>${(w.g*100).toFixed(1)}%</span></div>
            <div class="weight-bar"><div class="weight-fill" style="width:${w.g*100}%; background:var(--red)"></div></div>
        </div>
        <div class="weight-bar-group">
            <div class="weight-label"><span>Quality (&delta;)</span><span>${(w.d*100).toFixed(1)}%</span></div>
            <div class="weight-bar"><div class="weight-fill" style="width:${w.d*100}%; background:var(--blue)"></div></div>
        </div>
    `;
}

// ── Graphs (Chart.js) ──
function drawGraphs() {
    if (!roundHistory.length) return;
    document.getElementById('graphsContainer').style.display = 'block';

    const labels = roundHistory.map(r => r.round);
    
    // Destroy old charts if exist
    if (energyChart) energyChart.destroy();
    if (fitnessChart) fitnessChart.destroy();
    if (aliveNodesChart) aliveNodesChart.destroy();
    if (costChart) costChart.destroy();

    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#e4e6f0', font: { size: 9 } } } },
        scales: {
            x: { ticks: { color: '#9498b3', font: { size: 8 } }, grid: { color: '#2a2d42' } },
            y: { ticks: { color: '#9498b3', font: { size: 8 } }, grid: { color: '#2a2d42' } }
        }
    };

    // 1. Energy
    energyChart = new Chart(document.getElementById('energyGraph'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Adaptive (MAM-AM)', data: roundHistory.map(r => r.energy), borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 1 },
                { label: 'Fixed (MAM)', data: fixedRoundHistory.map(r => r.energy), borderColor: '#e74c3c', backgroundColor: 'transparent', borderDash: [5, 5], tension: 0.3, borderWidth: 2, pointRadius: 1 }
            ]
        },
        options: chartOptions
    });

    // 2. Fitness
    fitnessChart = new Chart(document.getElementById('fitnessGraph'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Adaptive Fitness', data: roundHistory.map(r => r.fitness), borderColor: '#3498db', tension: 0.3, borderWidth: 2, pointRadius: 1 },
                { label: 'Fixed Fitness', data: fixedRoundHistory.map(r => r.fitness), borderColor: '#95a5a6', borderDash: [5, 5], tension: 0.3, borderWidth: 2, pointRadius: 1 }
            ]
        },
        options: chartOptions
    });

    // 3. Alive Nodes
    aliveNodesChart = new Chart(document.getElementById('aliveNodesGraph'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Adaptive Alive', data: roundHistory.map(r => r.alive), borderColor: '#f1c40f', tension: 0.1, borderWidth: 2, pointRadius: 0 },
                { label: 'Fixed Alive', data: fixedRoundHistory.map(r => r.alive), borderColor: '#e67e22', borderDash: [5, 5], tension: 0.1, borderWidth: 2, pointRadius: 0 }
            ]
        },
        options: chartOptions
    });

    // 4. Cost
    costChart = new Chart(document.getElementById('costGraph'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Adaptive Hops', data: roundHistory.map(r => r.cost), backgroundColor: '#6c63ff' },
                { label: 'Fixed Hops', data: fixedRoundHistory.map(r => r.cost), backgroundColor: '#353858' }
            ]
        },
        options: chartOptions
    });
}

// ── Canvas Drawing ──
function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const c = getCfg();
    document.getElementById('canvasLegend').style.display = 'flex';

    if (nodes.length === 0) return;

    // Draw connections
    if (currentView === 'all') {
        Object.entries(clusters).forEach(([cid, mems]) => {
            let chNode = nodes[cid];
            if (!chNode) return;
            let p1 = mapCoord(chNode.x, chNode.y, c.area);
            ctx.strokeStyle = '#353858';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            mems.forEach(mid => {
                let m = nodes[mid];
                let p2 = mapCoord(m.x, m.y, c.area);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            });
            ctx.setLineDash([]);
        });
    }

    // Draw optimal path
    if (bestResult && (currentView === 'path' || currentView === 'all')) {
        let path = bestResult.path;
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
            let p = mapCoord(nodes[path[i]].x, nodes[path[i]].y, c.area);
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        let bsp = mapCoord(c.bsX, c.bsY, c.area);
        ctx.lineTo(bsp.x, bsp.y);

        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    const showLabels = nodes.length <= 150;

    // Draw nodes
    nodes.forEach(n => {
        let p = mapCoord(n.x, n.y, c.area);
        let isPath = bestResult && bestResult.path.includes(n.id);

        if (currentView === 'path' && !isPath && !n.isCH && n.alive) {
            ctx.fillStyle = '#353858';
            ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
            return;
        }

        if (!n.alive) {
            // Dead Node: Gray circle with Red X
            ctx.fillStyle = '#555';
            ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x - 3, p.y - 3); ctx.lineTo(p.x + 3, p.y + 3);
            ctx.moveTo(p.x + 3, p.y - 3); ctx.lineTo(p.x - 3, p.y + 3);
            ctx.stroke();
        } else if (n.isCH) {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 8);
            ctx.lineTo(p.x + 8, p.y + 6);
            ctx.lineTo(p.x - 8, p.y + 6);
            ctx.closePath();
            ctx.fill();
            if (currentView === 'all' && showLabels) {
                ctx.fillStyle = '#fff';
                ctx.font = '9px Arial';
                ctx.fillText(`CH${n.id}`, p.x + 10, p.y - 5);
            }
        } else {
            ctx.fillStyle = isPath ? '#2ecc71' : '#3498db';
            let r = isPath ? 6 : (nodes.length > 300 ? 2 : 4);
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();

            if (currentView === 'all' && showLabels) {
                ctx.fillStyle = '#aaa';
                ctx.font = '8px Arial';
                ctx.fillText(`${n.id}`, p.x + 6, p.y + 6);
            }
        }
    });

    // Draw Base Station
    let bsp = mapCoord(c.bsX, c.bsY, c.area);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.fillRect(bsp.x - 10, bsp.y - 10, 20, 20);
    ctx.strokeRect(bsp.x - 10, bsp.y - 10, 20, 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('BS', bsp.x - 20, bsp.y - 15);
}

// ────────────────────────────────────────
// NEW ROUTING FRAMEWORKS HANDLERS
// ────────────────────────────────────────

function onFrameworkChange() {
    const framework = document.getElementById('routingFramework').value;
    
    // Hide all strategy cards first
    document.getElementById('traditionalActiveCard').style.display = 'none';
    document.getElementById('aiActiveCard').style.display = 'none';
    document.getElementById('aiAgentReportCard').style.display = 'none';
    document.getElementById('aiAgentCard').style.display = 'none';
    document.getElementById('executionFlowCard').style.display = 'none';
    
    if (framework === 'traditional') {
        document.getElementById('traditionalActiveCard').style.display = 'block';
        log('Traditional Routing Framework Activated (TDO + CMTO + AMGSO)', 'info');
        
        // Update execution flow step labels
        document.getElementById('flow-tdo').innerHTML = '<span class="flow-icon">1</span><div class="flow-text"><strong>TDO</strong> <br>CH Selection</div>';
        document.getElementById('flow-cmto').innerHTML = '<span class="flow-icon">2</span><div class="flow-text"><strong>CMTO</strong> <br>Candidate Paths</div>';
        document.getElementById('flow-amgso').innerHTML = '<span class="flow-icon">3</span><div class="flow-text"><strong>AMGSO</strong> <br>Dead Nodes Excluded</div>';
    } else if (framework === 'ai') {
        document.getElementById('aiActiveCard').style.display = 'block';
        document.getElementById('aiAgentReportCard').style.display = 'block';
        log('AI Routing Framework Activated (PSO + ACO + AI Agent)', 'info');
        
        // Update execution flow step labels
        document.getElementById('flow-tdo').innerHTML = '<span class="flow-icon">1</span><div class="flow-text"><strong>PSO</strong> <br>CH Selection</div>';
        document.getElementById('flow-cmto').innerHTML = '<span class="flow-icon">2</span><div class="flow-text"><strong>ACO</strong> <br>Optimal Paths</div>';
        document.getElementById('flow-amgso').innerHTML = '<span class="flow-icon">3</span><div class="flow-text"><strong>AI Agent</strong> <br>Weights Selected</div>';
    } else {
        log('Intelligent AI Agent Control Activated (Dynamic Traffic-Based Selection)', 'info');
    }
}

function runComparison() {
    const c = getCfg();
    log(`[COMPARISON] Initiating side-by-side run of Option A (Traditional) vs Option B (AI)...`, 'step');
    
    document.getElementById('statusBadge').innerText = 'Comparing...';
    document.getElementById('statusBadge').className = 'badge running';
    document.getElementById('btnDeploy').disabled = true;
    document.getElementById('btnOptimize').disabled = true;
    document.getElementById('btnSimulate').disabled = true;
    document.getElementById('btnCompare').disabled = true;

    // 1. Setup environment copies
    let tempNodesOriginal = JSON.parse(JSON.stringify(nodes));
    
    let nodesTrad = JSON.parse(JSON.stringify(tempNodesOriginal));
    let nodesAI = JSON.parse(JSON.stringify(tempNodesOriginal));
    
    let tradHistory = [];
    let aiHistory = [];
    
    // Run Traditional Simulation (TDO + CMTO + AMGSO)
    nodes = nodesTrad;
    for (let r = 1; r <= c.rounds; r++) {
        let alive = nodes.filter(n => n.alive).length;
        if (alive < 3) break;
        
        let optimalCHCount = calculateOptimalCH(nodes, c.bsX, c.bsY, c.area);
        let selectedCH = tdoSelectCH(c.bsX, c.bsY, optimalCHCount, c.range);
        formClusters(selectedCH);
        let cPaths = cmtoGenerate(selectedCH, c.bsX, c.bsY);
        let oPaths = amgsoRoute(cPaths);
        let results = selectBestPaths(oPaths, c.bsX, c.bsY, false, null);
        
        if (Object.keys(results).length === 0) break;
        let bestCh = Object.keys(results).reduce((a, b) => results[a].fitness > results[b].fitness ? a : b);
        let res = results[bestCh];
        
        // Drain energy
        res.path.forEach(nid => {
            nodes[nid].energy -= c.energy;
            if (nodes[nid].energy <= 0) { nodes[nid].energy = 0; nodes[nid].alive = false; }
        });
        
        tradHistory.push({
            round: r,
            fitness: res.fitness,
            energy: nodes.reduce((s,n) => s+n.energy, 0),
            cost: res.cost,
            quality: res.quality,
            alive: alive
        });
    }

    // Run AI Simulation (PSO + ACO + AI Agent)
    nodes = nodesAI;
    for (let r = 1; r <= c.rounds; r++) {
        let alive = nodes.filter(n => n.alive).length;
        if (alive < 3) break;
        
        const stats = getNetworkStats();
        let networkState = {
            nodes: c.n,
            trafficLevel: c.trafficLevel,
            areaSize: c.area,
            avgEnergy: stats ? stats.avgEnergy : 0.5,
            maxEnergy: nodes[0].maxEnergy,
            deadNodes: stats ? stats.dead : 0,
            density: stats ? parseFloat(stats.density) : 0
        };
        let agentDecision = wsnAgent.analyzeAndDecide(networkState, nodes, c.bsX, c.bsY);
        
        let optimalCHCount = agentDecision.optimalCHCount;
        let selectedCH = psoSelectCH(c.bsX, c.bsY, optimalCHCount, c.range);
        formClusters(selectedCH);
        let cPaths = acoRoute(selectedCH, c.bsX, c.bsY);
        let results = selectBestPaths(cPaths, c.bsX, c.bsY, false, agentDecision);
        
        if (Object.keys(results).length === 0) break;
        let bestCh = Object.keys(results).reduce((a, b) => results[a].fitness > results[b].fitness ? a : b);
        let res = results[bestCh];
        
        // Drain energy
        res.path.forEach(nid => {
            nodes[nid].energy -= c.energy;
            if (nodes[nid].energy <= 0) { nodes[nid].energy = 0; nodes[nid].alive = false; }
        });
        
        aiHistory.push({
            round: r,
            fitness: res.fitness,
            energy: nodes.reduce((s,n) => s+n.energy, 0),
            cost: res.cost,
            quality: res.quality,
            alive: alive
        });
    }
    
    // Restore original state
    nodes = tempNodesOriginal;
    chIds = [];
    clusters = {};
    bestResult = null;

    // Display comparison container
    document.getElementById('comparisonContainer').style.display = 'block';
    
    // Update text stats
    let lastTrad = tradHistory[tradHistory.length - 1] || { cost: 0, fitness: 0, quality: 0 };
    let lastAI = aiHistory[aiHistory.length - 1] || { cost: 0, fitness: 0, quality: 0 };
    
    document.getElementById('compCostTrad').innerText = lastTrad.cost.toFixed(0);
    document.getElementById('compCostAI').innerText = lastAI.cost.toFixed(0);
    document.getElementById('compFitTrad').innerText = lastTrad.fitness.toFixed(3);
    document.getElementById('compFitAI').innerText = lastAI.fitness.toFixed(3);
    document.getElementById('compDelayTrad').innerText = lastTrad.quality.toFixed(3);
    document.getElementById('compDelayAI').innerText = lastAI.quality.toFixed(3);
    
    // Draw Comparison Graphs
    drawComparisonGraphs(tradHistory, aiHistory);
    
    // Enable buttons
    document.getElementById('btnDeploy').disabled = false;
    document.getElementById('btnOptimize').disabled = false;
    document.getElementById('btnSimulate').disabled = false;
    document.getElementById('btnCompare').disabled = false;
    document.getElementById('statusBadge').innerText = 'Comparison Done';
    document.getElementById('statusBadge').className = 'badge done';
    
    log(`[COMPARISON] Done! Displaying side-by-side comparison charts.`, 'success');
}

function drawComparisonGraphs(tradHistory, aiHistory) {
    let roundsCount = Math.max(tradHistory.length, aiHistory.length);
    let labels = Array.from({length: roundsCount}, (_, i) => i + 1);
    
    if (compEnergyChart) compEnergyChart.destroy();
    if (compCostChart) compCostChart.destroy();
    if (compFitnessChart) compFitnessChart.destroy();
    if (compAliveChart) compAliveChart.destroy();
    
    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#e4e6f0', font: { size: 9 } } } },
        scales: {
            x: { ticks: { color: '#9498b3', font: { size: 8 } }, grid: { color: '#2a2d42' } },
            y: { ticks: { color: '#9498b3', font: { size: 8 } }, grid: { color: '#2a2d42' } }
        }
    };
    
    // 1. Energy Chart
    compEnergyChart = new Chart(document.getElementById('compEnergyGraph'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Option A: Traditional', data: tradHistory.map(h => h.energy), borderColor: '#8e2de2', backgroundColor: 'rgba(142, 45, 226, 0.1)', tension: 0.3, borderWidth: 2, pointRadius: 1 },
                { label: 'Option B: AI-Based', data: aiHistory.map(h => h.energy), borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', tension: 0.3, borderWidth: 2, pointRadius: 1 }
            ]
        },
        options: chartOptions
    });
    
    // 2. Path Cost Hops
    compCostChart = new Chart(document.getElementById('compCostGraph'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Option A: Traditional Hops', data: tradHistory.map(h => h.cost), borderColor: '#8e2de2', tension: 0.3, borderWidth: 2 },
                { label: 'Option B: AI-Based Hops', data: aiHistory.map(h => h.cost), borderColor: '#2ecc71', tension: 0.3, borderWidth: 2 }
            ]
        },
        options: chartOptions
    });
    
    // 3. Fitness Chart
    compFitnessChart = new Chart(document.getElementById('compFitnessGraph'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Option A: Traditional Fitness', data: tradHistory.map(h => h.fitness), borderColor: '#8e2de2', tension: 0.3, borderWidth: 2 },
                { label: 'Option B: AI-Based Fitness', data: aiHistory.map(h => h.fitness), borderColor: '#2ecc71', tension: 0.3, borderWidth: 2 }
            ]
        },
        options: chartOptions
    });
    
    // 4. Alive Nodes Chart
    compAliveChart = new Chart(document.getElementById('compAliveGraph'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Option A: Traditional Alive', data: tradHistory.map(h => h.alive), borderColor: '#8e2de2', tension: 0.1, borderWidth: 2 },
                { label: 'Option B: AI-Based Alive', data: aiHistory.map(h => h.alive), borderColor: '#2ecc71', tension: 0.1, borderWidth: 2 }
            ]
        },
        options: chartOptions
    });
}
