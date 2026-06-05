"""
Core Module: Node model, TDO, CMTO, AMGSO, Fitness Function
WSN Routing Optimization Simulation
"""
import numpy as np
import math, random

# ────────────────────────────────────────
# SENSOR NODE CLASS
# ────────────────────────────────────────
class SensorNode:
    def __init__(self, node_id, x, y, energy=0.5):
        self.id = node_id
        self.x = x
        self.y = y
        self.energy = energy
        self.initial_energy = energy
        self.neighbors = []
        self.is_alive = True
        self.is_ch = False  # Cluster Head flag
        self.cluster_id = -1

    def distance_to(self, other_x, other_y):
        return math.sqrt((self.x - other_x)**2 + (self.y - other_y)**2)

# ────────────────────────────────────────
# STEP 0: DEPLOY NODES
# ────────────────────────────────────────
def deploy_nodes(n, area_size=100, comm_range=35):
    """Deploy N sensor nodes randomly and discover neighbors."""
    np.random.seed(42)
    nodes = []
    for i in range(n):
        x = np.random.uniform(0, area_size)
        y = np.random.uniform(0, area_size)
        e = np.random.uniform(0.3, 0.6)
        nodes.append(SensorNode(i, x, y, e))
    # Neighbor discovery
    for i in range(n):
        for j in range(n):
            if i != j:
                d = nodes[i].distance_to(nodes[j].x, nodes[j].y)
                if d <= comm_range:
                    nodes[i].neighbors.append(j)
    return nodes

# ────────────────────────────────────────
# STEP 1: TDO – Cluster Head Selection
# Tasmanian Devil Optimization (simplified)
# ────────────────────────────────────────
def tdo_cluster_head_selection(nodes, bs_x, bs_y, num_ch=5, iterations=20):
    """
    TDO evaluates each node using:
      score = w_e * energy + w_n * neighbor_ratio - w_d * dist_to_bs
    Best nodes become Cluster Heads.
    """
    n = len(nodes)
    alive = [nd for nd in nodes if nd.is_alive]
    max_dist = max(nd.distance_to(bs_x, bs_y) for nd in alive)
    max_neigh = max(len(nd.neighbors) for nd in alive) or 1

    # TDO population: each "devil" is a candidate CH set
    pop_size = 10
    population = []
    for _ in range(pop_size):
        candidate = random.sample([nd.id for nd in alive], min(num_ch, len(alive)))
        population.append(candidate)

    def evaluate_set(ch_ids):
        score = 0
        for cid in ch_ids:
            nd = nodes[cid]
            e_score = nd.energy / nd.initial_energy
            n_score = len(nd.neighbors) / max_neigh
            d_score = nd.distance_to(bs_x, bs_y) / max_dist
            score += 0.5 * e_score + 0.3 * n_score - 0.2 * d_score
        return score

    # TDO iterative improvement
    best_set = population[0]
    best_fit = evaluate_set(best_set)
    for it in range(iterations):
        for idx in range(pop_size):
            # Hunting phase: move towards best
            new_set = list(best_set)
            # Scavenging phase: random swap
            swap_idx = random.randint(0, len(new_set)-1)
            candidates = [nd.id for nd in alive if nd.id not in new_set]
            if candidates:
                new_set[swap_idx] = random.choice(candidates)
            fit = evaluate_set(new_set)
            if fit > best_fit:
                best_fit = fit
                best_set = new_set
                population[idx] = new_set

    # Mark cluster heads
    for nd in nodes:
        nd.is_ch = False
    for cid in best_set:
        nodes[cid].is_ch = True
    return best_set

# ────────────────────────────────────────
# STEP 2: CLUSTER FORMATION
# ────────────────────────────────────────
def form_clusters(nodes, ch_ids):
    """Assign each non-CH node to nearest Cluster Head."""
    clusters = {cid: [] for cid in ch_ids}
    for nd in nodes:
        if nd.id in ch_ids or not nd.is_alive:
            nd.cluster_id = nd.id if nd.id in ch_ids else -1
            continue
        min_d = float('inf')
        best_ch = ch_ids[0]
        for cid in ch_ids:
            d = nd.distance_to(nodes[cid].x, nodes[cid].y)
            if d < min_d:
                min_d = d
                best_ch = cid
        nd.cluster_id = best_ch
        clusters[best_ch].append(nd.id)
    return clusters

# ────────────────────────────────────────
# STEP 3: CMTO – Path Generation
# Cat and Mouse Based Optimizer (simplified)
# ────────────────────────────────────────
def _build_greedy_path(nodes, start_id, bs_x, bs_y):
    """Build a single greedy path from start to BS vicinity."""
    path = [start_id]
    visited = {start_id}
    current = nodes[start_id]
    for _ in range(15):  # max hops
        if current.distance_to(bs_x, bs_y) < 20:
            break
        best_next = None
        best_score = -1e9
        for nid in current.neighbors:
            if nid in visited or not nodes[nid].is_alive:
                continue
            nd = nodes[nid]
            score = nd.energy - 0.01 * nd.distance_to(bs_x, bs_y)
            if score > best_score:
                best_score = score
                best_next = nid
        if best_next is None:
            break
        path.append(best_next)
        visited.add(best_next)
        current = nodes[best_next]
    return path

def cmto_path_generation(nodes, ch_ids, bs_x, bs_y, num_paths=5, iterations=15):
    """
    Generate candidate paths from each CH to BS using CMTO logic.
    Cat = current best path, Mice = other candidate paths.
    Mice try to improve by borrowing segments from the Cat.
    """
    all_paths = {}
    for cid in ch_ids:
        # Generate initial mice (candidate paths)
        mice = []
        for _ in range(num_paths):
            p = _build_greedy_path(nodes, cid, bs_x, bs_y)
            # Add randomness
            if len(p) > 2 and random.random() < 0.5:
                idx = random.randint(1, len(p)-1)
                nd = nodes[p[idx]]
                alts = [n for n in nd.neighbors if n not in p and nodes[n].is_alive]
                if alts:
                    p[idx] = random.choice(alts)
            mice.append(p)

        # Cat = best path so far
        def path_cost(p):
            dist = sum(nodes[p[i]].distance_to(nodes[p[i+1]].x, nodes[p[i+1]].y) for i in range(len(p)-1))
            energy = sum(nodes[nid].energy for nid in p)
            return energy / (dist + 1)

        cat = max(mice, key=path_cost)
        cat_score = path_cost(cat)

        # CMTO iterations: mice move toward cat
        for it in range(iterations):
            for m_idx in range(len(mice)):
                mouse = list(mice[m_idx])
                # Borrow a node from cat's path
                if len(cat) > 2:
                    borrow = random.choice(cat[1:])
                    if borrow not in mouse and len(mouse) > 2:
                        ins_pos = random.randint(1, len(mouse)-1)
                        mouse.insert(ins_pos, borrow)
                        # Remove duplicate visits
                        seen = set()
                        clean = []
                        for nid in mouse:
                            if nid not in seen:
                                clean.append(nid)
                                seen.add(nid)
                        mouse = clean
                sc = path_cost(mouse)
                if sc > path_cost(mice[m_idx]):
                    mice[m_idx] = mouse
                    if sc > cat_score:
                        cat = mouse
                        cat_score = sc
        all_paths[cid] = mice + [cat]
    return all_paths

# ────────────────────────────────────────
# STEP 4: AMGSO – Routing Optimization
# Artificial Macaque Glowworm Swarm (simplified)
# ────────────────────────────────────────
def amgso_routing(nodes, candidate_paths, bs_x, bs_y, iterations=10):
    """
    AMGSO refines paths:
    - Remove dead/low-energy nodes
    - Improve path stability by swapping weak links
    """
    optimized = {}
    for cid, paths in candidate_paths.items():
        refined = []
        for path in paths:
            p = list(path)
            for it in range(iterations):
                # Remove dead nodes
                p = [nid for nid in p if nodes[nid].is_alive and nodes[nid].energy > 0.02]
                if len(p) < 2:
                    break
                # Find weakest node (lowest energy) and try to replace
                energies = [(i, nodes[p[i]].energy) for i in range(1, len(p)-1)] if len(p) > 2 else []
                if energies:
                    weak_idx, weak_e = min(energies, key=lambda x: x[1])
                    weak_node = nodes[p[weak_idx]]
                    # Look for better neighbor
                    alts = [n for n in weak_node.neighbors
                            if n not in p and nodes[n].is_alive and nodes[n].energy > weak_e]
                    if alts:
                        best_alt = max(alts, key=lambda n: nodes[n].energy)
                        p[weak_idx] = best_alt
            if len(p) >= 2:
                refined.append(p)
        if not refined:
            refined = [paths[0]]
        optimized[cid] = refined
    return optimized

# ────────────────────────────────────────
# STEP 5 & 6: Parameter Calc + Adaptive Fitness
# ────────────────────────────────────────
def calculate_path_params(nodes, path, bs_x, bs_y):
    """Calculate Energy, Distance, Cost, Path Quality for a path."""
    if len(path) < 1:
        return 0, 1e9, 1e9, 0
    energy = sum(nodes[nid].energy for nid in path)
    distance = 0
    for i in range(len(path)-1):
        distance += nodes[path[i]].distance_to(nodes[path[i+1]].x, nodes[path[i+1]].y)
    # Add distance from last node to BS
    distance += nodes[path[-1]].distance_to(bs_x, bs_y)
    cost = len(path)  # hop count
    # Path quality = avg energy / max single hop distance
    avg_e = energy / len(path)
    max_hop = 0
    for i in range(len(path)-1):
        h = nodes[path[i]].distance_to(nodes[path[i+1]].x, nodes[path[i+1]].y)
        if h > max_hop:
            max_hop = h
    last_hop = nodes[path[-1]].distance_to(bs_x, bs_y)
    max_hop = max(max_hop, last_hop, 1)
    quality = avg_e / (max_hop / 100)
    return energy, distance, cost, quality

def adaptive_weights(avg_energy, avg_distance, avg_cost):
    """
    Dynamically adjust weights based on network conditions.
    If energy is low  → increase alpha
    If distance is high → increase beta
    If cost is high → increase gamma
    """
    alpha = 0.25
    beta = 0.25
    gamma = 0.25
    delta = 0.25
    # Adjust based on conditions
    if avg_energy < 0.3:
        alpha += 0.15
    elif avg_energy < 0.5:
        alpha += 0.05
    if avg_distance > 80:
        beta += 0.15
    elif avg_distance > 50:
        beta += 0.05
    if avg_cost > 6:
        gamma += 0.15
    elif avg_cost > 4:
        gamma += 0.05
    # Normalize weights to sum to 1
    total = alpha + beta + gamma + delta
    return alpha/total, beta/total, gamma/total, delta/total

def fitness_function(E, D, C, P, w1, w2, w3, w4):
    """Adaptive Fitness = w1*E + w2*(1/D) + w3*(1/C) + w4*P"""
    inv_d = 1.0 / (D + 1e-6)
    inv_c = 1.0 / (C + 1e-6)
    return w1 * E + w2 * inv_d + w3 * inv_c + w4 * P

# ────────────────────────────────────────
# STEP 7: HEURISTIC FUNCTION
# ────────────────────────────────────────
def heuristic_function(E, D, C, P):
    """H = (1/E) + (1/D) + (1/C) + P — guides path selection."""
    return 1.0/(E+1e-6) + 1.0/(D+1e-6) + 1.0/(C+1e-6) + P

# ────────────────────────────────────────
# STEP 8: FINAL PATH SELECTION
# ────────────────────────────────────────
def select_best_paths(nodes, optimized_paths, bs_x, bs_y, agent_decision=None):
    """Evaluate all paths, return best per CH with fitness details."""
    results = {}
    all_params = []

    # First pass: collect all params for normalization & weight calc
    raw = {}
    for cid, paths in optimized_paths.items():
        raw[cid] = []
        for p in paths:
            e, d, c, q = calculate_path_params(nodes, p, bs_x, bs_y)
            raw[cid].append((p, e, d, c, q))
            all_params.append((e, d, c, q))

    if not all_params:
        return {}

    # Normalization bounds
    es = [x[0] for x in all_params]
    ds = [x[1] for x in all_params]
    cs = [x[2] for x in all_params]
    qs = [x[3] for x in all_params]
    max_e = max(es) or 1; max_d = max(ds) or 1
    max_c = max(cs) or 1; max_q = max(qs) or 1

    # Weights determination
    if agent_decision:
        w1 = agent_decision['weights']['a']
        w2 = agent_decision['weights']['b']
        w3 = agent_decision['weights']['g']
        w4 = agent_decision['weights']['d']
        scenario = agent_decision['priority']
    else:
        # Fallback to standard adaptive weights
        avg_e = np.mean(es)
        avg_d = np.mean(ds)
        avg_c = np.mean(cs)
        w1, w2, w3, w4 = adaptive_weights(avg_e, avg_d, avg_c)
        scenario = "Adaptive Weights"

    for cid, entries in raw.items():
        best_fit = -1e9
        best_entry = None
        for (p, e, d, c, q) in entries:
            en = e / max_e
            dn = d / max_d
            cn = c / max_c
            qn = q / max_q
            fit = fitness_function(en, dn, cn, qn, w1, w2, w3, w4)
            h = heuristic_function(en, dn, cn, qn)
            if fit > best_fit:
                best_fit = fit
                best_entry = {
                    'path': p, 'fitness': fit, 'heuristic': h,
                    'energy': e, 'distance': d, 'cost': c,
                    'quality': q, 'weights': (w1, w2, w3, w4),
                    'scenario': scenario
                }
        if best_entry:
            results[cid] = best_entry
    return results


# ────────────────────────────────────────
# ADVANCED AI FRAMEWORK - PSO & ACO
# ────────────────────────────────────────
def pso_cluster_head_selection(nodes, bs_x, bs_y, num_ch=5, iterations=20):
    """
    PSO for Cluster Head Selection.
    Particles represent candidate sets of CH ids.
    Optimize based on energy, distance to base station, and neighborhood density.
    """
    alive = [nd for nd in nodes if nd.is_alive]
    if not alive:
        return []
    num_ch = min(num_ch, len(alive))
    max_dist = max(nd.distance_to(bs_x, bs_y) for nd in alive) or 1
    max_neigh = max(len(nd.neighbors) for nd in alive) or 1

    def evaluate(ch_set):
        score = 0
        for cid in ch_set:
            nd = nodes[cid]
            e_score = nd.energy / nd.initial_energy
            n_score = len(nd.neighbors) / max_neigh
            d_score = nd.distance_to(bs_x, bs_y) / max_dist
            score += 0.4 * e_score + 0.4 * n_score - 0.2 * d_score
        return score

    # Swarm initialization
    num_particles = 10
    particles = []
    pbest = []
    pbest_scores = []
    for _ in range(num_particles):
        p = random.sample([nd.id for nd in alive], num_ch)
        particles.append(p)
        pbest.append(list(p))
        pbest_scores.append(evaluate(p))

    gbest = list(pbest[np.argmax(pbest_scores)])
    gbest_score = max(pbest_scores)

    # PSO iterations
    for it in range(iterations):
        for i in range(num_particles):
            current = particles[i]
            new_candidate = []
            
            # Cognitive and social components via probabilistic selection
            for j in range(num_ch):
                r = random.random()
                if r < 0.4:
                    new_candidate.append(current[j])
                elif r < 0.7:
                    new_candidate.append(pbest[i][j])
                else:
                    new_candidate.append(gbest[j])

            # Ensure unique IDs and replace duplicates
            new_candidate = list(set(new_candidate))
            while len(new_candidate) < num_ch:
                remaining = [nd.id for nd in alive if nd.id not in new_candidate]
                if not remaining:
                    break
                new_candidate.append(random.choice(remaining))
            new_candidate = new_candidate[:num_ch]

            # Evaluate
            score = evaluate(new_candidate)
            particles[i] = new_candidate
            if score > pbest_scores[i]:
                pbest[i] = list(new_candidate)
                pbest_scores[i] = score
                if score > gbest_score:
                    gbest = list(new_candidate)
                    gbest_score = score

    # Mark cluster heads
    for nd in nodes:
        nd.is_ch = False
    for cid in gbest:
        nodes[cid].is_ch = True
    return gbest


def aco_path_finding(nodes, ch_ids, bs_x, bs_y, iterations=15, num_ants=5):
    """
    Ant Colony Optimization (ACO) for path finding from each CH to the Base Station.
    Finds a set of multi-hop paths to the Base Station.
    """
    all_paths = {}
    alpha = 1.0  # Pheromone importance
    beta = 2.0   # Heuristic importance (energy / distance)

    for cid in ch_ids:
        pheromones = {}
        
        def get_heuristic(u, v):
            nd_u = nodes[u]
            nd_v = nodes[v]
            d = nd_u.distance_to(nd_v.x, nd_v.y) or 1
            e = nd_v.energy
            d_bs = nd_v.distance_to(bs_x, bs_y) or 1
            return (e / d) * (1.0 / d_bs)

        best_path = None
        best_score = -1e9

        for it in range(iterations):
            ants_paths = []
            for ant in range(num_ants):
                path = [cid]
                curr = cid
                visited = {cid}
                
                for hop in range(10):
                    if nodes[curr].distance_to(bs_x, bs_y) < 20:
                        break
                    
                    # Candidates: alive CHs closer to BS or just alive neighbors
                    candidates = [nid for nid in ch_ids if nid not in visited and nodes[nid].is_alive]
                    if not candidates:
                        candidates = [nid for nid in nodes[curr].neighbors if nid not in visited and nodes[nid].is_alive]

                    if not candidates:
                        break

                    probs = []
                    for cand in candidates:
                        link = (curr, cand)
                        tau = pheromones.get(link, 1.0)
                        eta = get_heuristic(curr, cand)
                        probs.append((tau ** alpha) * (eta ** beta))
                    
                    total = sum(probs)
                    if total == 0:
                        next_node = random.choice(candidates)
                    else:
                        probs = [p / total for p in probs]
                        next_node = np.random.choice(candidates, p=probs)

                    path.append(next_node)
                    visited.add(next_node)
                    curr = next_node

                ants_paths.append(path)

            # Evaporate
            for link in list(pheromones.keys()):
                pheromones[link] *= 0.8
            
            # Pheromone deposit and track best
            for path in ants_paths:
                dist_val = sum(nodes[path[i]].distance_to(nodes[path[i+1]].x, nodes[path[i+1]].y) for i in range(len(path)-1))
                dist_val += nodes[path[-1]].distance_to(bs_x, bs_y)
                energy_val = sum(nodes[nid].energy for nid in path)
                score = energy_val / (dist_val + 1)

                if score > best_score:
                    best_score = score
                    best_path = path

                for i in range(len(path)-1):
                    link = (path[i], path[i+1])
                    pheromones[link] = pheromones.get(link, 1.0) + 1.0

        all_paths[cid] = [best_path] if best_path else [[cid]]
        
    return all_paths


# ────────────────────────────────────────
# DYNAMIC CH & AGENT STRATEGY SELECTION
# ────────────────────────────────────────
def calculate_optimal_ch(nodes, area_size, bs_x, bs_y):
    """
    Standard analytical formula for optimal cluster heads count:
    k_opt = sqrt(N / (2 * pi)) * (M / d_toBS)
    """
    alive = [nd for nd in nodes if nd.is_alive]
    n = len(alive)
    if n <= 3:
        return 1
    # average distance of alive nodes to base station
    sum_dist = sum(nd.distance_to(bs_x, bs_y) for nd in alive)
    avg_dist = sum_dist / n
    
    k_opt = round(math.sqrt(n / (2 * math.pi)) * (area_size / max(1.0, avg_dist)))
    # Clamp between 2 and n // 4 to ensure clustering is feasible
    k_opt = max(2, min(k_opt, n // 4))
    return k_opt


class IntelligentAgent:
    def __init__(self):
        self.last_decision = None

    def analyze_and_decide(self, network_state):
        """
        Analyze network conditions and decide adaptive weights, priority, and framework.
        network_state = {
            'nodes': int,
            'traffic_level': str ('low', 'medium', 'high'),
            'area_size': float,
            'avg_energy': float,
            'max_energy': float,
            'dead_nodes': int,
            'density': float
        }
        """
        ch_strategy = 'TDO'
        routing_strategy = 'CMTO'
        weights = { 'a': 0.25, 'b': 0.25, 'g': 0.25, 'd': 0.25 }
        reason = ""
        priority = ""
        framework = 1  # 1 = Traditional, 2 = AI-Based

        e_ratio = network_state['avg_energy'] / network_state['max_energy'] if network_state['max_energy'] > 0 else 0
        area_flag = network_state['area_size'] > 300

        # Traffic-based framework selection:
        # High traffic demands AI-based framework to optimize path cost and handle heavy communication load.
        # Medium and low traffic uses Traditional framework to save node computation energy.
        if network_state['traffic_level'] == 'high':
            framework = 2
            ch_strategy = 'PSO'
            routing_strategy = 'ACO'
            weights = { 'a': 0.20, 'b': 0.35, 'g': 0.35, 'd': 0.10 }
            priority = "Shortest Path & Cost"
            reason = "High traffic level detected. AI framework (PSO + ACO) selected to optimize shortest paths and minimize hop delays."
        elif e_ratio < 0.4:
            framework = 1
            ch_strategy = 'Energy-Based CH'
            routing_strategy = 'Energy-Aware CMTO'
            weights = { 'a': 0.45, 'b': 0.25, 'g': 0.15, 'd': 0.15 }
            priority = "Energy Saving"
            reason = "Low network energy detected. Lightweight Traditional framework selected with maximum alpha weight to extend lifetime."
        elif area_flag:
            framework = 2
            ch_strategy = 'Distance-Optimized CH'
            routing_strategy = 'Distance-Aware ACO'
            weights = { 'a': 0.20, 'b': 0.50, 'g': 0.15, 'd': 0.15 }
            priority = "Distance Optimization"
            reason = "Large network area detected. AI framework selected. Prioritizing distance optimization to prevent long-range transmission failures."
        elif network_state['density'] > 20:
            framework = 1
            ch_strategy = 'TDO (Standard)'
            routing_strategy = 'CMTO (Standard)'
            weights = { 'a': 0.20, 'b': 0.20, 'g': 0.40, 'd': 0.20 }
            priority = "Hop-Count Minimization"
            reason = "Dense network detected. Traditional framework selected. Prioritizing hop count minimization to reduce redundant transmissions."
        else:
            framework = 1
            ch_strategy = 'TDO (Standard)'
            routing_strategy = 'CMTO (Standard)'
            weights = { 'a': 0.30, 'b': 0.30, 'g': 0.20, 'd': 0.20 }
            priority = "Balanced Optimization"
            reason = "Normal network conditions detected. Traditional framework with standard weights selected."

        self.last_decision = {
            'framework': framework,
            'ch_strategy': ch_strategy,
            'routing_strategy': routing_strategy,
            'weights': weights,
            'priority': priority,
            'reason': reason,
            'network_state': network_state
        }
        return self.last_decision


# ────────────────────────────────────────
# USER FIT-BASED CLUSTER HEAD SELECTION
# ────────────────────────────────────────
def choose_cluster_head(nodes, base_station):
    """
    Select Cluster Head using Fitness Function
    based on:
    1. Residual Energy
    2. Distance to Base Station
    3. Optimal Path Cost
    4. Communication Cost
    """
    # Support base_station as a tuple/list or an object/node
    if isinstance(base_station, (tuple, list, np.ndarray)):
        bs_x, bs_y = base_station[0], base_station[1]
    else:
        bs_x, bs_y = base_station.x, base_station.y

    alive_nodes = [
        node for node in nodes
        if node.is_alive
    ]

    if not alive_nodes:
        return None

    # Remove previous CH selection
    for node in nodes:
        node.is_ch = False

    # Ensure path_cost and comm_cost are set
    for node in alive_nodes:
        if not hasattr(node, 'path_cost') or node.path_cost is None:
            node.path_cost = node.distance_to(bs_x, bs_y)
        if not hasattr(node, 'comm_cost') or node.comm_cost is None:
            alive_nbrs = [nodes[nbr] for nbr in node.neighbors if nodes[nbr].is_alive]
            if alive_nbrs:
                node.comm_cost = sum(node.distance_to(nbr.x, nbr.y) for nbr in alive_nbrs) / len(alive_nbrs)
            else:
                node.comm_cost = node.path_cost

    # Select best cluster head
    best_ch = max(
        alive_nodes,
        key=lambda node: (
            0.40 * (node.energy / node.initial_energy) +

            0.25 * (
                1 - min(
                    node.distance_to(bs_x, bs_y) / 150.0,
                    1.0
                )
            ) +

            0.20 * (
                1 - min(
                    node.path_cost / 100.0,
                    1.0
                )
            ) +

            0.15 * (
                1 - min(
                    node.comm_cost / 100.0,
                    1.0
                )
            )
        )
    )

    best_ch.is_ch = True

    return best_ch


def fitness_cluster_head_selection(nodes, bs_x, bs_y, num_ch=5):
    """
    Multi-CH version of the fitness selection using the USER's formula.
    """
    alive_nodes = [node for node in nodes if node.is_alive]
    if not alive_nodes:
        return []

    # Remove previous CH selection
    for node in nodes:
        node.is_ch = False

    # Ensure path_cost and comm_cost are set
    for node in alive_nodes:
        if not hasattr(node, 'path_cost') or node.path_cost is None:
            node.path_cost = node.distance_to(bs_x, bs_y)
        if not hasattr(node, 'comm_cost') or node.comm_cost is None:
            alive_nbrs = [nodes[nbr] for nbr in node.neighbors if nodes[nbr].is_alive]
            if alive_nbrs:
                node.comm_cost = sum(node.distance_to(nbr.x, nbr.y) for nbr in alive_nbrs) / len(alive_nbrs)
            else:
                node.comm_cost = node.path_cost

    def fitness_score(node):
        return (
            0.40 * (node.energy / node.initial_energy) +
            0.25 * (1 - min(node.distance_to(bs_x, bs_y) / 150.0, 1.0)) +
            0.20 * (1 - min(node.path_cost / 100.0, 1.0)) +
            0.15 * (1 - min(node.comm_cost / 100.0, 1.0))
        )

    # Sort nodes by fitness descending
    sorted_nodes = sorted(alive_nodes, key=fitness_score, reverse=True)
    selected = sorted_nodes[:min(num_ch, len(sorted_nodes))]
    
    for nd in selected:
        nd.is_ch = True
        
    return [nd.id for nd in selected]



