/* WSN Simulation Engine - Core Algorithms */

// State
let nodes = [];
let chIds = [];
let clusters = {}; 
let bestResult = null;
let roundHistory = []; // Adaptive history
let fixedRoundHistory = []; // Fixed weight history for comparison

// Node Class
class Node {
    constructor(id, x, y, e) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.energy = e;
        this.maxEnergy = e;
        this.alive = true;
        this.isCH = false;
        this.chId = null;
        this.pathCost = null;
        this.commCost = null;
    }
}

// 1. Deployment & Energy Configuration
function deployNodes(n, area, range, energyMode, uniformEnergy, bsX, bsY) {
    nodes = [];
    for (let i = 0; i < n; i++) {
        let x = Math.random() * area;
        let y = Math.random() * area;
        let e = 0.5;

        if (energyMode === 'random') {
            e = 0.3 + Math.random() * 0.3; // 0.3 to 0.6
        } else if (energyMode === 'uniform') {
            e = uniformEnergy || 0.5;
        } else if (energyMode === 'distance') {
            let d = dist(x, y, bsX, bsY);
            let maxD = Math.sqrt(area*area + area*area);
            let ratio = d / maxD;
            e = 0.3 + (ratio * 0.4); // 0.3 to 0.7
        } else if (energyMode === 'custom') {
            e = 0.5; // Defaults to 0.5, user edits later
        }

        nodes.push(new Node(i, x, y, e));
    }
}

function applyEnergyPreset(mode, uniformEnergy, bsX, bsY, area) {
    nodes.forEach(n => {
        if (mode === 'random') n.energy = 0.3 + Math.random() * 0.3;
        else if (mode === 'uniform') n.energy = uniformEnergy || 0.5;
        else if (mode === 'distance') {
            let d = dist(n.x, n.y, bsX, bsY);
            let maxD = Math.sqrt(area*area + area*area);
            let ratio = d / maxD;
            n.energy = 0.3 + (ratio * 0.4);
        }
        n.maxEnergy = n.energy;
    });
}

function setNodeEnergies(energiesList) {
    energiesList.forEach(item => {
        let n = nodes.find(n => n.id === item.id);
        if (n) {
            n.energy = item.energy;
            n.maxEnergy = item.energy;
        }
    });
}

function getNetworkStats() {
    if (nodes.length === 0) return null;
    let alive = nodes.filter(n => n.alive);
    let dead = nodes.filter(n => !n.alive);
    let totalEnergy = alive.reduce((sum, n) => sum + n.energy, 0);
    return {
        total: nodes.length,
        alive: alive.length,
        dead: dead.length,
        totalEnergy: totalEnergy,
        avgEnergy: alive.length > 0 ? totalEnergy / alive.length : 0,
        density: (alive.length / (nodes.length / 10)).toFixed(1)
    };
}

function dist(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// 2. TDO: Cluster Head Selection (Tasmanian Devil Optimization)
function calculateOptimalCH(nodesList, bsX, bsY, areaSize) {
    let alive = nodesList.filter(n => n.alive);
    let N = alive.length;
    if (N <= 3) return 1;
    let sumDist = 0;
    alive.forEach(n => {
        sumDist += dist(n.x, n.y, bsX, bsY);
    });
    let avgDistToBS = sumDist / N;
    // Standard analytical formula for optimal cluster heads count:
    // k_opt = sqrt(N / (2 * pi)) * (M / d_toBS)
    let k_opt = Math.round(Math.sqrt(N / (2 * Math.PI)) * (areaSize / Math.max(1.0, avgDistToBS)));
    // Clamp between 2 and N/4 to keep clustering feasible and efficient
    k_opt = Math.max(2, Math.min(k_opt, Math.floor(N / 4)));
    return k_opt;
}

// Custom Fitness-based Cluster Head Selection requested by USER
function chooseClusterHead(nodesList, bsX, bsY) {
    let alive = nodesList.filter(n => n.alive);
    if (alive.length === 0) return null;

    // Reset previous CH flags
    alive.forEach(n => n.isCH = false);

    // Ensure pathCost and commCost are populated
    alive.forEach(n => {
        n.pathCost = dist(n.x, n.y, bsX, bsY);
        let neighbors = alive.filter(other => other.id !== n.id && dist(n.x, n.y, other.x, other.y) <= 35);
        if (neighbors.length > 0) {
            n.commCost = neighbors.reduce((sum, other) => sum + dist(n.x, n.y, other.x, other.y), 0) / neighbors.length;
        } else {
            n.commCost = n.pathCost;
        }
    });

    let best = null;
    let bestScore = -1e9;

    alive.forEach(node => {
        let fitness = 0.40 * (node.energy / node.maxEnergy) +
                      0.25 * (1 - Math.min(dist(node.x, node.y, bsX, bsY) / 150.0, 1.0)) +
                      0.20 * (1 - Math.min(node.pathCost / 100.0, 1.0)) +
                      0.15 * (1 - Math.min(node.commCost / 100.0, 1.0));
        if (fitness > bestScore) {
            bestScore = fitness;
            best = node;
        }
    });

    if (best) {
        best.isCH = true;
    }
    return best;
}

// Multi-CH Selection using the USER's fitness formula
function fitnessSelectCH(bsX, bsY, numCH) {
    let alive = nodes.filter(n => n.alive);
    nodes.forEach(n => n.isCH = false);

    if (alive.length === 0) return [];

    // Ensure pathCost and commCost are populated
    alive.forEach(n => {
        n.pathCost = dist(n.x, n.y, bsX, bsY);
        let neighbors = alive.filter(other => other.id !== n.id && dist(n.x, n.y, other.x, other.y) <= 35);
        if (neighbors.length > 0) {
            n.commCost = neighbors.reduce((sum, other) => sum + dist(n.x, n.y, other.x, other.y), 0) / neighbors.length;
        } else {
            n.commCost = n.pathCost;
        }
    });

    alive.forEach(node => {
        node.fitnessScore = 0.40 * (node.energy / node.maxEnergy) +
                            0.25 * (1 - Math.min(dist(node.x, node.y, bsX, bsY) / 150.0, 1.0)) +
                            0.20 * (1 - Math.min(node.pathCost / 100.0, 1.0)) +
                            0.15 * (1 - Math.min(node.commCost / 100.0, 1.0));
    });

    // Rank alive nodes by fitness score descending and pick top numCH
    alive.sort((a, b) => b.fitnessScore - a.fitnessScore);
    let selected = alive.slice(0, Math.min(numCH, alive.length));
    selected.forEach(n => n.isCH = true);
    
    return selected.map(n => n.id);
}

function tdoSelectCH(bsX, bsY, numCH, commRange = 35) {
    let alive = nodes.filter(n => n.alive);
    nodes.forEach(n => n.isCH = false);

    if (alive.length === 0) return [];
    
    // 1. Calculate neighbors and distances for alive nodes
    let neighborsCount = {};
    let maxNeigh = 1;
    let maxDist = 0.001;

    alive.forEach(n => {
        let d = dist(n.x, n.y, bsX, bsY);
        if (d > maxDist) maxDist = d;

        // Count neighbors within commRange
        let count = 0;
        alive.forEach(other => {
            if (n.id !== other.id) {
                if (dist(n.x, n.y, other.x, other.y) <= commRange) {
                    count++;
                }
            }
        });
        neighborsCount[n.id] = count;
        if (count > maxNeigh) maxNeigh = count;
    });

    // 2. TDO evaluation function
    function evaluateSet(chIdsSet) {
        let score = 0;
        chIdsSet.forEach(cid => {
            let nd = nodes[cid];
            let eScore = nd.energy / nd.maxEnergy;
            let nScore = neighborsCount[cid] / maxNeigh;
            let dScore = dist(nd.x, nd.y, bsX, bsY) / maxDist;
            score += 0.5 * eScore + 0.3 * nScore - 0.2 * dScore;
        });
        return score;
    }

    // 3. TDO population initialization
    let popSize = 10;
    let population = [];
    let k = Math.min(numCH, alive.length);

    for (let i = 0; i < popSize; i++) {
        let shuffled = [...alive].sort(() => 0.5 - Math.random());
        let candidate = shuffled.slice(0, k).map(n => n.id);
        population.push(candidate);
    }

    // TDO search iterations
    let bestSet = population[0];
    let bestFit = evaluateSet(bestSet);
    let iterations = 20;

    for (let it = 0; it < iterations; it++) {
        for (let idx = 0; idx < popSize; idx++) {
            let newSet = [...bestSet];
            
            // Scavenging phase: random swap
            let swapIdx = Math.floor(Math.random() * newSet.length);
            let candidates = alive.filter(n => !newSet.includes(n.id)).map(n => n.id);
            if (candidates.length > 0) {
                newSet[swapIdx] = candidates[Math.floor(Math.random() * candidates.length)];
            }
            
            let fit = evaluateSet(newSet);
            if (fit > bestFit) {
                bestFit = fit;
                bestSet = newSet;
                population[idx] = newSet;
            }
        }
    }

    bestSet.forEach(id => nodes[id].isCH = true);
    chIds = bestSet;
    return chIds;
}

// 3. Cluster Formation
function formClusters(chList) {
    clusters = {};
    chList.forEach(id => clusters[id] = []);
    
    nodes.forEach(n => {
        if (!n.alive || n.isCH) return;
        let bestCH = null;
        let minDist = Infinity;
        
        chList.forEach(cid => {
            let ch = nodes[cid];
            let d = dist(n.x, n.y, ch.x, ch.y);
            if (d < minDist) { minDist = d; bestCH = cid; }
        });
        
        if (bestCH !== null) {
            n.chId = bestCH;
            clusters[bestCH].push(n.id);
        }
    });
}

// 4. CMTO: Candidate Path Generation
function cmtoGenerate(chList, bsX, bsY) {
    let candidatePaths = {};
    chList.forEach(cid => {
        let paths = [];
        for (let i = 0; i < 5; i++) {
            let path = generateRandomPath(cid, chList, bsX, bsY);
            paths.push(path);
        }
        candidatePaths[cid] = paths;
    });
    return candidatePaths;
}

function generateRandomPath(startId, chList, bsX, bsY) {
    let path = [startId];
    let curr = nodes[startId];
    let visited = new Set([startId]);
    
    // Max 4 hops to prevent looping
    for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
        let dToBS = dist(curr.x, curr.y, bsX, bsY);
        // Find closer CHs
        let closer = chList.filter(id => {
            if (visited.has(id)) return false;
            let ch = nodes[id];
            return dist(ch.x, ch.y, bsX, bsY) < dToBS;
        });
        
        if (closer.length === 0) break;
        let next = closer[Math.floor(Math.random() * closer.length)];
        path.push(next);
        visited.add(next);
        curr = nodes[next];
    }
    return path;
}

// 5. AMGSO: Routing Optimization & Dead Node Removal
function amgsoRoute(candidatePaths) {
    let optimized = {};
    for (let cid in candidatePaths) {
        let paths = candidatePaths[cid];
        let refined = [];
        
        paths.forEach(p => {
            // AMGSO detects and removes dead nodes explicitly
            let valid = p.filter(id => nodes[id].alive);
            
            if (valid.length > 0) {
                // Heuristic improvement (shortcutting)
                if (valid.length > 2 && Math.random() > 0.5) {
                    valid.splice(1, 1); // remove a middle hop
                }
                refined.push(valid);
            }
        });
        optimized[cid] = refined.length ? refined : [[parseInt(cid)]];
    }
    return optimized;
}

// 6. Adaptive Fitness Evaluation (via AI Agent)
function evaluatePath(path, bsX, bsY, isFixed = false, agentDecision = null) {
    let e = 0;
    for (let id of path) {
        if (!nodes[id]) return null;
        e += nodes[id].energy;
    }
    
    let d = 0;
    for (let i=0; i<path.length-1; i++) {
        d += dist(nodes[path[i]].x, nodes[path[i]].y, nodes[path[i+1]].x, nodes[path[i+1]].y);
    }
    d += dist(nodes[path[path.length-1]].x, nodes[path[path.length-1]].y, bsX, bsY);
    
    let cost = path.length;
    let qual = e / (d * cost);
    let heur = qual * 1.5; // Custom heuristic metric
    
    let weightsData;
    if (isFixed) {
        // Fixed weights (MAM algorithm equivalent)
        weightsData = { weights: {a: 0.25, b: 0.25, g: 0.25, d: 0.25}, scenario: "Fixed Weights" };
    } else if (agentDecision) {
        // Weights assigned by the intelligent AI Agent
        weightsData = { weights: agentDecision.weights, scenario: `[${agentDecision.priority}] ${agentDecision.reason}` };
    } else {
        // Fallback
        weightsData = { weights: {a: 0.25, b: 0.25, g: 0.25, d: 0.25}, scenario: "Default" };
    }
    
    let w = weightsData.weights;
    
    // Fitness Calculation: higher is better
    // F = a*E_norm + b*(1/D_norm) + g*(1/C_norm) + d*Q_norm
    let f = (w.a * (e/10)) + (w.b * (100/d)) + (w.g * (1/cost)) + (w.d * qual);
    
    return {
        path: path,
        energy: e,
        distance: d,
        cost: cost,
        quality: qual,
        heuristic: heur,
        fitness: f,
        weights: w,
        scenario: weightsData.scenario
    };
}

function selectBestPaths(optimizedPaths, bsX, bsY, isFixed = false, agentDecision = null) {
    let results = {};
    for (let cid in optimizedPaths) {
        let best = null;
        optimizedPaths[cid].forEach(p => {
            let res = evaluatePath(p, bsX, bsY, isFixed, agentDecision);
            if (res && (!best || res.fitness > best.fitness)) {
                best = res;
            }
        });
        if (best) results[cid] = best;
    }
    return results;
}

// 7. Global Path Alternates
function getPathAlternatives(optimizedPaths, bsX, bsY, agentDecision = null) {
    let allPaths = [];
    for (let cid in optimizedPaths) {
        optimizedPaths[cid].forEach(p => {
            let res = evaluatePath(p, bsX, bsY, false, agentDecision); // adaptive
            if (res) allPaths.push(res);
        });
    }
    // Sort by fitness descending
    allPaths.sort((a, b) => b.fitness - a.fitness);
    
    // Get unique paths up to 3
    let unique = [];
    let seen = new Set();
    for (let p of allPaths) {
        let key = p.path.join('-');
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
            if (unique.length >= 3) break;
        }
    }
    return unique;
}

// ────────────────────────────────────────
// ADVANCED AI FRAMEWORK - PSO & ACO
// ────────────────────────────────────────

// PSO: Particle Swarm Optimization for Cluster Head Selection
function psoSelectCH(bsX, bsY, numCH, commRange = 35) {
    let alive = nodes.filter(n => n.alive);
    nodes.forEach(n => n.isCH = false);

    if (alive.length === 0) return [];
    let k = Math.min(numCH, alive.length);

    let neighborsCount = {};
    let maxNeigh = 1;
    let maxDist = 0.001;

    alive.forEach(n => {
        let d = dist(n.x, n.y, bsX, bsY);
        if (d > maxDist) maxDist = d;
        let count = 0;
        alive.forEach(other => {
            if (n.id !== other.id && dist(n.x, n.y, other.x, other.y) <= commRange) {
                count++;
            }
        });
        neighborsCount[n.id] = count;
        if (count > maxNeigh) maxNeigh = count;
    });

    function evaluate(chSet) {
        let score = 0;
        chSet.forEach(cid => {
            let nd = nodes[cid];
            let eScore = nd.energy / nd.maxEnergy;
            let nScore = neighborsCount[cid] / maxNeigh;
            let dScore = dist(nd.x, nd.y, bsX, bsY) / maxDist;
            score += 0.4 * eScore + 0.4 * nScore - 0.2 * dScore;
        });
        return score;
    }

    let numParticles = 10;
    let particles = [];
    let pbest = [];
    let pbestScores = [];

    for (let i = 0; i < numParticles; i++) {
        let shuffled = [...alive].sort(() => 0.5 - Math.random());
        let p = shuffled.slice(0, k).map(n => n.id);
        particles.push(p);
        pbest.push([...p]);
        pbestScores.push(evaluate(p));
    }

    let gbestIdx = pbestScores.indexOf(Math.max(...pbestScores));
    let gbest = [...pbest[gbestIdx]];
    let gbestScore = pbestScores[gbestIdx];

    let iterations = 20;
    for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < numParticles; i++) {
            let current = particles[i];
            let newCandidate = [];

            for (let j = 0; j < k; j++) {
                let r = Math.random();
                if (r < 0.4) {
                    newCandidate.push(current[j]);
                } else if (r < 0.7) {
                    newCandidate.push(pbest[i][j]);
                } else {
                    newCandidate.push(gbest[j]);
                }
            }

            newCandidate = [...new Set(newCandidate)];
            while (newCandidate.length < k) {
                let remaining = alive.filter(n => !newCandidate.includes(n.id)).map(n => n.id);
                if (remaining.length === 0) break;
                newCandidate.push(remaining[Math.floor(Math.random() * remaining.length)]);
            }
            newCandidate = newCandidate.slice(0, k);

            let score = evaluate(newCandidate);
            particles[i] = newCandidate;
            if (score > pbestScores[i]) {
                pbest[i] = [...newCandidate];
                pbestScores[i] = score;
                if (score > gbestScore) {
                    gbest = [...newCandidate];
                    gbestScore = score;
                }
            }
        }
    }

    gbest.forEach(id => nodes[id].isCH = true);
    chIds = gbest;
    return chIds;
}

// ACO: Ant Colony Optimization for Path Finding
function acoRoute(chList, bsX, bsY) {
    let allPaths = {};
    let alpha = 1.0;
    let beta = 2.0;

    chList.forEach(cid => {
        let pheromones = {};
        
        function getHeuristic(u, v) {
            let ndU = nodes[u];
            let ndV = nodes[v];
            let d = dist(ndU.x, ndU.y, ndV.x, ndV.y) || 1;
            let e = ndV.energy;
            let dBs = dist(ndV.x, ndV.y, bsX, bsY) || 1;
            return (e / d) * (100 / dBs);
        }

        let bestPath = null;
        let bestScore = -Infinity;
        let iterations = 15;
        let numAnts = 5;

        for (let it = 0; it < iterations; it++) {
            let antsPaths = [];
            for (let ant = 0; ant < numAnts; ant++) {
                let path = [cid];
                let curr = cid;
                let visited = new Set([cid]);

                for (let hop = 0; hop < 10; hop++) {
                    if (dist(nodes[curr].x, nodes[curr].y, bsX, bsY) < 20) {
                        break;
                    }

                    let candidates = chList.filter(id => !visited.has(id) && nodes[id].alive);
                    if (candidates.length === 0) {
                        candidates = nodes.filter(n => n.alive && !visited.has(n.id) && dist(nodes[curr].x, nodes[curr].y, n.x, n.y) < 50).map(n => n.id);
                    }

                    if (candidates.length === 0) break;

                    let probs = [];
                    candidates.forEach(cand => {
                        let linkKey = `${curr}-${cand}`;
                        let tau = pheromones[linkKey] || 1.0;
                        let eta = getHeuristic(curr, cand);
                        probs.push(Math.pow(tau, alpha) * Math.pow(eta, beta));
                    });

                    let total = probs.reduce((sum, p) => sum + p, 0);
                    let nextNode;
                    if (total === 0) {
                        nextNode = candidates[Math.floor(Math.random() * candidates.length)];
                    } else {
                        let r = Math.random() * total;
                        let runningSum = 0;
                        for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
                            runningSum += probs[cIdx];
                            if (r <= runningSum) {
                                nextNode = candidates[cIdx];
                                break;
                            }
                        }
                        if (!nextNode) nextNode = candidates[candidates.length - 1];
                    }

                    path.push(nextNode);
                    visited.add(nextNode);
                    curr = nextNode;
                }
                antsPaths.push(path);
            }

            for (let key in pheromones) {
                pheromones[key] *= 0.8;
            }

            antsPaths.forEach(p => {
                let e = 0;
                p.forEach(id => e += nodes[id].energy);
                let d = 0;
                for (let i = 0; i < p.length - 1; i++) {
                    d += dist(nodes[p[i]].x, nodes[p[i]].y, nodes[p[i+1]].x, nodes[p[i+1]].y);
                }
                d += dist(nodes[p[p.length - 1]].x, nodes[p[p.length - 1]].y, bsX, bsY);
                let score = e / (d + 1);

                if (score > bestScore) {
                    bestScore = score;
                    bestPath = p;
                }

                for (let i = 0; i < p.length - 1; i++) {
                    let key = `${p[i]}-${p[i+1]}`;
                    pheromones[key] = (pheromones[key] || 1.0) + 1.0;
                }
            });
        }
        allPaths[cid] = [bestPath || [cid]];
    });
    return allPaths;
}
