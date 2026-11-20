import random
import math

def run_algorithm(matrix, speed_mode, cancel_event):
    POPULATION_SIZE = None
    NUMBER_OF_GENERATION = None
    OPT_CHANCE = None

    match speed_mode:
        case "fast":
            POPULATION_SIZE = 100
            NUMBER_OF_GENERATION = 200
            OPT_CHANCE = 0.05
        case "quality":
            POPULATION_SIZE = 200
            NUMBER_OF_GENERATION = 600
            OPT_CHANCE = 0.15

    ELITISM = math.ceil(POPULATION_SIZE * 0.1)
    IMMIGRANTS = 5
    TOURNAMENT_SIZE = 3

    population = []
    next_generation = []
    best_solution = None

    check_cancelled(cancel_event)

    generate_population(population, matrix, POPULATION_SIZE, cancel_event)
    population.sort(key=lambda x: x.fitness)

    for i in range(NUMBER_OF_GENERATION):
        check_cancelled(cancel_event)
        generate_next_generation(population, next_generation, matrix, TOURNAMENT_SIZE, ELITISM, IMMIGRANTS, OPT_CHANCE, cancel_event)
        next_generation.sort(key=lambda x: x.fitness)

        best_solution = next_generation[0]

        population = next_generation.copy()
        next_generation.clear()

    return best_solution

def generate_population(population, matrix, population_size, cancel_event):
    n = len(matrix)
    greedy_count = population_size // 5

    for _ in range(greedy_count):
        check_cancelled(cancel_event)

        start = random.randrange(n)
        route = nearest_neighbour(matrix, start)
        population.append(Solution(route, matrix))

    for _ in range(population_size - greedy_count):
        check_cancelled(cancel_event)
        population.append(generate_random_solution(matrix))

def generate_random_solution(matrix):
    route = list(range(len(matrix)))
    random.shuffle(route)
    return Solution(route, matrix)

def nearest_neighbour(matrix, start):
    route = [start]
    unvisited = set(range(len(matrix)))
    unvisited.remove(start)
    current = start

    while unvisited:
        next_city = min(unvisited, key=lambda city: matrix[current][city])
        route.append(next_city)
        unvisited.remove(next_city)
        current = next_city

    return route

def generate_next_generation(population, next_generation, matrix, tournament_size, elitism, immigrants, opt_chance, cancel_event):
    next_generation.extend(population[:elitism])
    while len(next_generation) < len(population) - immigrants:
        check_cancelled(cancel_event)

        parent1 = get_parent(population, tournament_size)
        parent2 = get_parent(population, tournament_size)

        while parent1 == parent2:
            check_cancelled(cancel_event)
            parent2 = get_parent(population, tournament_size)

        child = crossover(parent1, parent2)
        mutate_child(child)

        if random.random() < opt_chance:
            child = two_opt(child, matrix, cancel_event)

        next_generation.append(Solution(child, matrix))

    for _ in range(immigrants):
        check_cancelled(cancel_event)
        next_generation.append(generate_random_solution(matrix))

def get_parent(population, tournament_size):
    return min(
        random.sample(population, tournament_size),
        key=lambda solution: solution.fitness
    )

def crossover(parent1, parent2):
    n = len(parent1.travel_order)
    start, end = sorted(random.sample(range(n), 2))
    child = [None] * n

    child[start:end] = parent1.travel_order[start:end]
    remaining = [
        city for city in parent2.travel_order if city not in child
    ]
    index = end % n

    for city in remaining:
        while child[index] is not None:
            index = (index + 1) % n
        child[index] = city

    return child

def mutate_child(child):
    MUTATION_RATE = 0.1

    if random.random() < MUTATION_RATE:
        i, j = sorted(random.sample(range(len(child)), 2))
        child[i:j + 1] = reversed(child[i:j + 1])

def two_opt(child, matrix, cancel_event):
    best = child[:]
    best_fitness = fitness_function(best, matrix)
    improved = True

    while improved:
        check_cancelled(cancel_event)
        improved = False

        for i in range(1, len(best) - 2):
            check_cancelled(cancel_event)

            for j in range(i + 1, len(best)):
                check_cancelled(cancel_event)

                if j - i == 1:
                    continue

                new_child = (
                    best[:i] + best[i:j][::-1] + best[j:]
                )

                new_fitness = fitness_function(new_child, matrix)

                if new_fitness < best_fitness:
                    best = new_child
                    best_fitness = new_fitness
                    improved = True
            if improved:
                break
    return best

def fitness_function(travel_order, matrix):
    total_distance = 0
    n = len(travel_order)

    for i in range(n):
        total_distance += matrix[travel_order[i]][travel_order[(i + 1) % n]]

    return total_distance

def check_cancelled(cancel_event):
    if cancel_event.is_set():
        raise CalculationCancelled()

class Solution:
    def __init__(self, travel_order, matrix):
        self.travel_order = travel_order
        self.fitness = fitness_function(travel_order, matrix)

class CalculationCancelled(Exception):
    pass