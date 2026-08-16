# https://cran.r-project.org/web/packages/sets/sets.pdf
library(sets)
library(RJSONIO)
library(fpc)

# Universes of discourse
# Range of values that the fuzzy variables may take
unv_time = seq(from=0.0, to=300.0, by=0.1) # Completion time
unv_completion = seq(from=0.0, to=100.0, by=0.1) # Executed number of repetitions from total
unv_reps = seq(from=0.0, to=50.0, by=1.0) # Number of repetitions
unv_sets = seq(from=0.0, to=10.0, by=1.0) # Number of sets
unv_performance = seq(from=0.0, to=100.0, by=0.1) # Representation of the current performance level
unv_mobility = seq(from=0.0, to=100.0, by=0.1) # Level of mobility
unv_exergame_diff = seq(from=0.0, to=100.0, by=0.1) # Difficulty of the exergame
unv_compensation = seq(from=0.0, to=100.0, by=1.0) # Compensation level
unv_fatigue = seq(from=0.0, to=100.0, by=1.0) # Fatigue level

unv_rep_incr = seq(from=-40.0, to=40.0, by=1.0) # The increment in the number of repetitions
unv_set_incr = seq(from=-3.0, to=3.0, by=1.0) # The increment in the number of sets
unv_time_incr = seq(from=-120.0, to=120.0, by=0.1) # The increment in the maximum time
unv_performance_incr = seq(from=-20.0, to=20.0, by=1.0) # The increment in the level of performance of the patient
unv_adequacy_incr = seq(from=-20.0, to=20.0, by=1.0) # The increment in the adequacy of an exergame
unv_exergame_number = seq(from=1.0, to=10.0, by=1.0) # The number of exergames

unv_waypoint_number = seq(from=2.0, to=10.0, by=1.0) # The number of waypoints in an exergame
unv_waypoint_distance = seq(from=0.0, to=1.0, by=0.01) # The average distance between waypoints

# Set of variables
variables <- list(
    time = fuzzy_partition(
      varnames = c(VL=0.0, L=75.0, M=150.0, H=225.0, VH=300.0),
      FUN=fuzzy_cone, radius=82.5, universe = unv_time
    ),
    completion = fuzzy_partition(
      varnames= c(VL=0.0, L=25.0, M=50.0, H=75.0, VH=100.0),
      FUN=fuzzy_cone, radius=27.5, universe=unv_completion
    ),
    reps = fuzzy_partition(
      varnames= c(VL=0.0, L=12.0, M=25.0, H=38.0, VH=50.0),
      FUN=fuzzy_cone, radius=14.0, universe=unv_reps
    ),
    sets = fuzzy_partition(
      varnames= c(VL=0.0, L=2, M=5.0, H=8, VH=10.0),
      FUN=fuzzy_cone, radius=4, universe=unv_sets
    ),
    performance = fuzzy_partition(
      varnames= c(VL=0.0, L=25.0, M=50.0, H=75.0, VH=100.0),
      FUN=fuzzy_cone, radius=27.5, universe=unv_performance
    ),
    mobility = fuzzy_partition(
      varnames= c(VL=0.0, L=25.0, M=50.0, H=75.0, VH=100.0),
      FUN=fuzzy_cone, radius=27.5, universe=unv_mobility
    ),
    exergame_diff = fuzzy_partition(
      varnames= c(VL=0.0, L=25.0, M=50.0, H=75.0, VH=100.0),
      FUN=fuzzy_cone, radius=27.5, universe=unv_exergame_diff
    ),
    compensation = fuzzy_variable(
      L = fuzzy_trapezoid_gset(corners = c(-1, 0, 8, 15), universe=unv_compensation),
      M = fuzzy_trapezoid_gset(corners = c(8, 15, 25, 30), universe=unv_compensation),
      H = fuzzy_trapezoid_gset(corners = c(25, 35, 100, 101), universe=unv_compensation)
    ),
    fatigue = fuzzy_variable(
      L = fuzzy_trapezoid_gset(corners = c(-1, 0, 15, 20), universe=unv_fatigue),
      M = fuzzy_trapezoid_gset(corners = c(15, 20, 30, 35), universe=unv_fatigue),
      H = fuzzy_trapezoid_gset(corners = c(30, 35, 100, 101), universe=unv_fatigue)
    ),

    rep_incr = fuzzy_partition(
      varnames= c(VL=-40.0, L=-20.0, M=0.0, H=20.0, VH=40.0),
      FUN=fuzzy_cone, radius=25.0, universe=unv_rep_incr
    ),
    set_incr = fuzzy_partition(
      varnames= c(VL=-3.0, L=-1.0, M=0.0, H=1.0, VH=3.0),
      FUN=fuzzy_cone, radius=2.0, universe=unv_set_incr
    ),
    time_incr = fuzzy_partition(
      varnames= c(VL=-120.0, L=-60.0, M=0.0, H=60.0, VH=120.0),
      FUN=fuzzy_cone, radius=66, universe=unv_time_incr
    ),
    performance_incr = fuzzy_partition(
      varnames= c(VL=-20.0, L=-10.0, M=0.0, H=10.0, VH=20.0),
      FUN=fuzzy_cone, radius=11, universe=unv_performance_incr
    ),
    adequacy_incr = fuzzy_partition(
      varnames= c(VL=-20.0, L=-10.0, M=0.0, H=10.0, VH=20.0),
      FUN=fuzzy_cone, radius=13, universe=unv_adequacy_incr
    ),
    exergame_number = fuzzy_partition(
      varnames= c(VL=1.0, L=3.0, M=5.0, H=8.0, VH=10.0),
      FUN=fuzzy_cone, radius=3, universe=unv_exergame_number
    ),
    
    waypoint_number = fuzzy_partition(
      varnames= c(VL=2.0, L=4.0, M=6.0, H=8.0, VH=10.0),
      FUN=fuzzy_cone, radius=3, universe=unv_waypoint_number
    ),
    waypoint_distance = fuzzy_partition(
      varnames= c(VL=0.0, L=0.25, M=0.5, H=0.75, VH=1.0),
      FUN=fuzzy_cone, radius=0.3, universe=unv_waypoint_distance
    )
  )

# Set of rules for each output variable
# Repetitions increment
rep_incr_rules <- list(
  # If the completion time or the completion rate is too high or too low,
  # the number of repetitions must be adjusted accordingly, to try to maintain
  # a medium level of time and completion
  fuzzy_rule(time %is% VL && completion %is% VH,
             rep_incr %is% VH),
  fuzzy_rule(time %is% VL && completion %is% M,
             rep_incr %is% H),
  fuzzy_rule(time %is% VL && completion %is% VL,
             rep_incr %is% M),
  
  fuzzy_rule(time %is% M && completion %is% VH,
             rep_incr %is% VH),
  fuzzy_rule(time %is% M && completion %is% M,
             rep_incr %is% M),
  fuzzy_rule(time %is% M && completion %is% VL,
             rep_incr %is% VL),
  
  fuzzy_rule(time %is% VH && completion %is% VH,
             rep_incr %is% M),
  fuzzy_rule(time %is% VH && completion %is% M,
             rep_incr %is% L),
  fuzzy_rule(time %is% VH && completion %is% VL,
             rep_incr %is% VL),
  
  # Factors such as the performance of the patient in the last exergames,
  # the mobility of the patient and the difficulty of the exergame must
  # also be taken into account
  
  fuzzy_rule(mobility %is% M, rep_incr %is% M),
  
  # Medium Performance
  fuzzy_rule(performance %is% M && mobility %is% VL && exergame_diff %is% L,
             rep_incr %is% M),
  fuzzy_rule(performance %is% M && mobility %is% VL && exergame_diff %is% M,
             rep_incr %is% M),
  fuzzy_rule(performance %is% M && mobility %is% VL && exergame_diff %is% H,
             rep_incr %is% L),
  
  fuzzy_rule(performance %is% M && mobility %is% VH && exergame_diff %is% L,
             rep_incr %is% H),
  fuzzy_rule(performance %is% M && mobility %is% VH && exergame_diff %is% M,
             rep_incr %is% M),
  fuzzy_rule(performance %is% M && mobility %is% VH && exergame_diff %is% H,
             rep_incr %is% M),
  
  # Low Performance
  fuzzy_rule(performance %is% VL && mobility %is% VL && exergame_diff %is% L,
             rep_incr %is% M),
  fuzzy_rule(performance %is% VL && mobility %is% VL && exergame_diff %is% M,
             rep_incr %is% L),
  fuzzy_rule(performance %is% VL && mobility %is% VL && exergame_diff %is% H,
             rep_incr %is% L),
  
  fuzzy_rule(performance %is% VL && mobility %is% VH && exergame_diff %is% L,
             rep_incr %is% H),
  fuzzy_rule(performance %is% VL && mobility %is% VH && exergame_diff %is% M,
             rep_incr %is% M),
  fuzzy_rule(performance %is% VL && mobility %is% VH && exergame_diff %is% H,
             rep_incr %is% M),
  
  # High Performance
  fuzzy_rule(performance %is% VH && mobility %is% VL && exergame_diff %is% L,
             rep_incr %is% M),
  fuzzy_rule(performance %is% VH && mobility %is% VL && exergame_diff %is% M,
             rep_incr %is% M),
  fuzzy_rule(performance %is% VH && mobility %is% VL && exergame_diff %is% H,
             rep_incr %is% L),
  
  fuzzy_rule(performance %is% VH && mobility %is% VH && exergame_diff %is% L,
             rep_incr %is% H),
  fuzzy_rule(performance %is% VH && mobility %is% VH && exergame_diff %is% M,
             rep_incr %is% H),
  fuzzy_rule(performance %is% VH && mobility %is% VH && exergame_diff %is% H,
             rep_incr %is% M),
  
  # Compensation
  fuzzy_rule(mobility %is% H && compensation %is% H, rep_incr %is% VL),
  fuzzy_rule(mobility %is% H && compensation %is% M, rep_incr %is% VL),

  fuzzy_rule(mobility %is% M && compensation %is% H, rep_incr %is% VL),
  fuzzy_rule(mobility %is% M && compensation %is% M, rep_incr %is% L),

  fuzzy_rule(mobility %is% L && compensation %is% H, rep_incr %is% L),

  # Fatigue
  fuzzy_rule(mobility %is% H && fatigue %is% H, rep_incr %is% VL),
  fuzzy_rule(mobility %is% H && fatigue %is% M, rep_incr %is% VL),

  fuzzy_rule(mobility %is% M && fatigue %is% H, rep_incr %is% VL),
  fuzzy_rule(mobility %is% M && fatigue %is% M, rep_incr %is% VL),

  fuzzy_rule(mobility %is% L && fatigue %is% H, rep_incr %is% VL)
)
rep_incr_model <- fuzzy_system(variables, rep_incr_rules)
rep_incr_models <- lapply(rep_incr_rules, function(rule) fuzzy_system(variables, list(rule)))

# Set increment
set_incr_rules <- list(
  # The number of sets must be similar to the number of repetitions
  fuzzy_rule(reps %is% VL && sets %is% VL,
             set_incr %is% M),
  fuzzy_rule(reps %is% M && sets %is% M,
             set_incr %is% M),
  fuzzy_rule(reps %is% H && sets %is% H,
             set_incr %is% M),
  
  fuzzy_rule(reps %is% L && sets %is% M,
             set_incr %is% L),
  fuzzy_rule(reps %is% VH && sets %is% M,
             set_incr %is% VH),
  fuzzy_rule(reps %is% H && sets %is% VL,
             set_incr %is% VH),
  fuzzy_rule(reps %is% L && sets %is% VH,
             set_incr %is% VL)
 )
set_incr_model <- fuzzy_system (variables, set_incr_rules)
set_incr_models <- lapply(set_incr_rules, function(rule) fuzzy_system(variables, list(rule)))

# Time increment
time_incr_rules <- list(
  # The system must be more lenient with the time than with the number of repetitions
  # Otherwise, they are very similar
  
  # If the completion time or the completion rate is too high or too low,
  # the number of repetitions must be adjusted accordingly, to try to maintain
  # a medium level of time and completion
  fuzzy_rule(time %is% VL && completion %is% VH,
             time_incr %is% L),
  fuzzy_rule(time %is% VL && completion %is% M,
             time_incr %is% L),
  fuzzy_rule(time %is% VL && completion %is% VL,
             time_incr %is% M),
  
  fuzzy_rule(time %is% M && completion %is% VH,
             time_incr %is% L),
  fuzzy_rule(time %is% M && completion %is% M,
             time_incr %is% M),
  fuzzy_rule(time %is% M && completion %is% VL,
             time_incr %is% H),
  
  fuzzy_rule(time %is% VH && completion %is% VH,
             time_incr %is% M),
  fuzzy_rule(time %is% VH && completion %is% M,
             time_incr %is% H),
  fuzzy_rule(time %is% VH && completion %is% VL,
             time_incr %is% VH),
  
  # Factors such as the performance of the patient in the last exergames,
  # the mobility of the patient and the difficulty of the exergame must
  # also be taken into account
  
  fuzzy_rule(mobility %is% M, time_incr %is% M),
  
  # Medium Performance
  fuzzy_rule(performance %is% M && mobility %is% VL && exergame_diff %is% L,
             time_incr %is% M),
  fuzzy_rule(performance %is% M && mobility %is% VL && exergame_diff %is% M,
             time_incr %is% H),
  fuzzy_rule(performance %is% M && mobility %is% VL && exergame_diff %is% H,
             time_incr %is% H),
  
  fuzzy_rule(performance %is% M && mobility %is% VH && exergame_diff %is% L,
             time_incr %is% L),
  fuzzy_rule(performance %is% M && mobility %is% VH && exergame_diff %is% M,
             time_incr %is% M),
  fuzzy_rule(performance %is% M && mobility %is% VH && exergame_diff %is% H,
             time_incr %is% M),
  
  # Low Performance
  fuzzy_rule(performance %is% VL && mobility %is% VL && exergame_diff %is% L,
             time_incr %is% M),
  fuzzy_rule(performance %is% VL && mobility %is% VL && exergame_diff %is% M,
             time_incr %is% H),
  fuzzy_rule(performance %is% VL && mobility %is% VL && exergame_diff %is% H,
             time_incr %is% H),
  
  fuzzy_rule(performance %is% VL && mobility %is% VH && exergame_diff %is% L,
             time_incr %is% L),
  fuzzy_rule(performance %is% VL && mobility %is% VH && exergame_diff %is% M,
             time_incr %is% M),
  fuzzy_rule(performance %is% VL && mobility %is% VH && exergame_diff %is% H,
             time_incr %is% M),
  
  # High Performance
  fuzzy_rule(performance %is% VH && mobility %is% VL && exergame_diff %is% L,
             time_incr %is% M),
  fuzzy_rule(performance %is% VH && mobility %is% VL && exergame_diff %is% M,
             time_incr %is% M),
  fuzzy_rule(performance %is% VH && mobility %is% VL && exergame_diff %is% H,
             time_incr %is% H),
  
  fuzzy_rule(performance %is% VH && mobility %is% VH && exergame_diff %is% L,
             time_incr %is% L),
  fuzzy_rule(performance %is% VH && mobility %is% VH && exergame_diff %is% M,
             time_incr %is% M),
  fuzzy_rule(performance %is% VH && mobility %is% VH && exergame_diff %is% H,
             time_incr %is% M)
)
time_incr_model <- fuzzy_system(variables, time_incr_rules)
time_incr_models <- lapply(time_incr_rules, function(rule) fuzzy_system(variables, list(rule)))

# Performance increment
performance_incr_rules <- list(
  # Take into account the time - completion combination
  fuzzy_rule(time %is% VL && completion %is% VH,
             performance_incr %is% VH),
  fuzzy_rule(time %is% VL && completion %is% M,
             performance_incr %is% H),
  fuzzy_rule(time %is% VL && completion %is% VL,
             performance_incr %is% M),
  
  fuzzy_rule(time %is% M && completion %is% VH,
             performance_incr %is% H),
  fuzzy_rule(time %is% M && completion %is% M,
             performance_incr %is% M),
  fuzzy_rule(time %is% M && completion %is% VL,
             performance_incr %is% L),
  
  fuzzy_rule(time %is% VH && completion %is% VH,
             performance_incr %is% M),
  fuzzy_rule(time %is% VH && completion %is% M,
             performance_incr %is% L),
  fuzzy_rule(time %is% VH && completion %is% VL,
             performance_incr %is% VL),
  
  # Take into account the mobility - exergame difficulty combination
  fuzzy_rule(mobility %is% VL && exergame_diff %is% VL,
             performance_incr %is% M),
  fuzzy_rule(mobility %is% VL && exergame_diff %is% M,
             performance_incr %is% M),
  fuzzy_rule(mobility %is% VL && exergame_diff %is% VH,
             performance_incr %is% H),
  
  fuzzy_rule(mobility %is% M && exergame_diff %is% VL,
             performance_incr %is% M),
  fuzzy_rule(mobility %is% M && exergame_diff %is% M,
             performance_incr %is% M),
  fuzzy_rule(mobility %is% M && exergame_diff %is% VH,
             performance_incr %is% H),
  
  fuzzy_rule(mobility %is% VH && exergame_diff %is% VL,
             performance_incr %is% M),
  fuzzy_rule(mobility %is% VH && exergame_diff %is% M,
             performance_incr %is% M),
  fuzzy_rule(mobility %is% VH && exergame_diff %is% VH,
             performance_incr %is% H),

  # Fatigue
  fuzzy_rule(mobility %is% H && fatigue %is% H, performance_incr %is% VL),
  fuzzy_rule(mobility %is% M && fatigue %is% H, performance_incr %is% VL),
  fuzzy_rule(mobility %is% L && fatigue %is% H, performance_incr %is% L)
)
performance_incr_model <- fuzzy_system(variables, performance_incr_rules)
performance_incr_models <- lapply(performance_incr_rules, function(rule) fuzzy_system(variables, list(rule)))

# Adequacy increment
adequacy_incr_rules <- list(
  # The lower the mobility, the less extreme results are
  fuzzy_rule(mobility %is% L && time %is% VL && completion %is% VH,
             adequacy_incr %is% L),
  fuzzy_rule(mobility %is% L && time %is% M && completion %is% H,
             adequacy_incr %is% VH),
  fuzzy_rule(mobility %is% L && time %is% VH && completion %is% L,
             adequacy_incr %is% L),
  
  fuzzy_rule(mobility %is% L && time %is% VL && completion %is% L,
             adequacy_incr %is% M),
  fuzzy_rule(mobility %is% L && time %is% VH && completion %is% VH,
             adequacy_incr %is% L),
  
  fuzzy_rule(mobility %is% M && time %is% VL && completion %is% VH,
             adequacy_incr %is% L),
  fuzzy_rule(mobility %is% M && time %is% M && completion %is% H,
             adequacy_incr %is% VH),
  fuzzy_rule(mobility %is% M && time %is% VH && completion %is% L,
             adequacy_incr %is% L),
  
  fuzzy_rule(mobility %is% M && time %is% VL && completion %is% L,
             adequacy_incr %is% M),
  fuzzy_rule(mobility %is% M && time %is% VH && completion %is% VH,
             adequacy_incr %is% M),
  
  fuzzy_rule(mobility %is% H && time %is% VL && completion %is% VH,
             adequacy_incr %is% VL),
  fuzzy_rule(mobility %is% H && time %is% M && completion %is% H,
             adequacy_incr %is% VH),
  fuzzy_rule(mobility %is% H && time %is% VH && completion %is% L,
             adequacy_incr %is% VL),
  
  fuzzy_rule(mobility %is% H && time %is% VL && completion %is% L,
             adequacy_incr %is% L),
  fuzzy_rule(mobility %is% H && time %is% VH && completion %is% VH,
             adequacy_incr %is% VL),

  # Compensation
  fuzzy_rule(mobility %is% H && compensation %is% H, adequacy_incr %is% VL),
  fuzzy_rule(mobility %is% H && compensation %is% M, adequacy_incr %is% VL),

  fuzzy_rule(mobility %is% M && compensation %is% H, adequacy_incr %is% VL),
  fuzzy_rule(mobility %is% M && compensation %is% M, adequacy_incr %is% L),

  fuzzy_rule(mobility %is% L && compensation %is% H, adequacy_incr %is% L),

  # Fatigue
  fuzzy_rule(mobility %is% H && fatigue %is% H, adequacy_incr %is% VL),
  fuzzy_rule(mobility %is% H && fatigue %is% M, adequacy_incr %is% VL),

  fuzzy_rule(mobility %is% M && fatigue %is% H, adequacy_incr %is% VL),
  fuzzy_rule(mobility %is% M && fatigue %is% M, adequacy_incr %is% VL),

  fuzzy_rule(mobility %is% L && fatigue %is% H, adequacy_incr %is% VL),

  # Ad-hoc rules for missing results
  fuzzy_rule(mobility %is% VL && time %is% M && completion %is% VL,
             adequacy_incr %is% L),
  fuzzy_rule(mobility %is% M && time %is% M && completion %is% VL,
             adequacy_incr %is% L),
  fuzzy_rule(mobility %is% VH && time %is% M && completion %is% VL,
             adequacy_incr %is% VL),
  fuzzy_rule(mobility %is% M && time %is% VH && completion %is% M,
             adequacy_incr %is% L)
)
adequacy_incr_model <- fuzzy_system(variables, adequacy_incr_rules)
adequacy_incr_models <- lapply(adequacy_incr_rules, function(rule) fuzzy_system(variables, list(rule)))

# Exergame number
exergame_number_rules <- list(
  fuzzy_rule(mobility %is% M && performance %is% VH,
             exergame_number %is% VH),
  fuzzy_rule(mobility %is% M && performance %is% M,
             exergame_number %is% M),
  fuzzy_rule(mobility %is% M && performance %is% VL,
             exergame_number %is% VL),
  
  fuzzy_rule(mobility %is% H && performance %is% VH,
             exergame_number %is% H),
  fuzzy_rule(mobility %is% H && performance %is% M,
             exergame_number %is% M),
  fuzzy_rule(mobility %is% H && performance %is% VL,
             exergame_number %is% VL),
  
  fuzzy_rule(mobility %is% L && performance %is% VH,
             exergame_number %is% VH),
  fuzzy_rule(mobility %is% L && performance %is% M,
             exergame_number %is% M),
  fuzzy_rule(mobility %is% L && performance %is% VL,
             exergame_number %is% L),
  
  # Compensation
  fuzzy_rule(mobility %is% H && compensation %is% H, exergame_number %is% VL),
  fuzzy_rule(mobility %is% H && compensation %is% M, exergame_number %is% L),

  fuzzy_rule(mobility %is% M && compensation %is% H, exergame_number %is% VL),
  fuzzy_rule(mobility %is% M && compensation %is% M, exergame_number %is% L),
  fuzzy_rule(mobility %is% M && compensation %is% L, exergame_number %is% M),

  fuzzy_rule(mobility %is% L && compensation %is% H, exergame_number %is% L),
  fuzzy_rule(mobility %is% L && compensation %is% M, exergame_number %is% M),
  fuzzy_rule(mobility %is% L && compensation %is% L, exergame_number %is% M),

  # Fatigue
  fuzzy_rule(mobility %is% H && fatigue %is% H, exergame_number %is% VL),
  fuzzy_rule(mobility %is% H && fatigue %is% M, exergame_number %is% L),

  fuzzy_rule(mobility %is% M && fatigue %is% H, exergame_number %is% VL),
  fuzzy_rule(mobility %is% M && fatigue %is% M, exergame_number %is% L),

  fuzzy_rule(mobility %is% L && fatigue %is% H, exergame_number %is% L)
)
exergame_number_model <- fuzzy_system(variables, exergame_number_rules)
exergame_number_models <- lapply(exergame_number_rules, function(rule) fuzzy_system(variables, list(rule)))

# Exergame difficulty
exergame_diff_rules <- list(
  fuzzy_rule(waypoint_number %is% VL && waypoint_distance %is% VL,
             exergame_diff %is% L),
  fuzzy_rule(waypoint_number %is% VL && waypoint_distance %is% M,
             exergame_diff %is% L),
  fuzzy_rule(waypoint_number %is% VL && waypoint_distance %is% VH,
             exergame_diff %is% M),
  
  fuzzy_rule(waypoint_number %is% M && waypoint_distance %is% VL,
             exergame_diff %is% M),
  fuzzy_rule(waypoint_number %is% M && waypoint_distance %is% M,
             exergame_diff %is% M),
  fuzzy_rule(waypoint_number %is% M && waypoint_distance %is% VH,
             exergame_diff %is% H),
  
  fuzzy_rule(waypoint_number %is% VH && waypoint_distance %is% VL,
             exergame_diff %is% H),
  fuzzy_rule(waypoint_number %is% VH && waypoint_distance %is% M,
             exergame_diff %is% H),
  fuzzy_rule(waypoint_number %is% VH && waypoint_distance %is% VH,
             exergame_diff %is% VH)
)
exergame_diff_model <- fuzzy_system(variables, exergame_diff_rules)
exergame_diff_models <- lapply(exergame_diff_rules, function(rule) fuzzy_system(variables, list(rule)))

get_explanation <- function(rules, models, values) {
  inferences <- sapply(models, function(model) fuzzy_inference(model, values))
  added_inferences <- sapply(inferences, function(inference) sum(gset_memberships(inference)))
  max_inference_index <- which.max(unlist(added_inferences))
  rule_string <- toString(rules[max_inference_index])
  output_value <- gset_defuzzify(unlist(inferences[max_inference_index]), "centroid")
  return(list(
    rule_string = rule_string,
    input_values = values,
    output_value = output_value
  ))
}

infer_exergame_increments <- function(time, completion, performance, mobility, exergame_diff, reps, sets, compensation, fatigue) {
  # exergame['time'], exergame['completion'], routine['performance'], routine['mobility'], exergame['exergame_diff'], exergame['reps'], exergame['sets'], exergame['compensation'], routine['fatigue']
  explanations <- list()
  
  rep_incr_values <- list(
    time = time,
    completion = completion,
    performance = performance,
    mobility = mobility,
    exergame_diff = exergame_diff,
    compensation = compensation,
    fatigue = fatigue
  )
  rep_incr <- gset_defuzzify(fuzzy_inference(rep_incr_model, rep_incr_values), "centroid")
  explanations <- append(explanations, list(get_explanation(rep_incr_rules, rep_incr_models, rep_incr_values)))
  
  set_incr_values <- list(
    time = time,
    completion = completion,
    reps = reps,
    sets = sets
  )
  set_incr <- gset_defuzzify(fuzzy_inference(set_incr_model, set_incr_values), "centroid")
  explanations <- append(explanations, list(get_explanation(set_incr_rules, set_incr_models, set_incr_values)))
  
  time_incr_values <- list(
    time = time,
    completion = completion,
    performance = performance,
    mobility = mobility,
    exergame_diff = exergame_diff
  )
  time_incr <- gset_defuzzify(fuzzy_inference(time_incr_model, time_incr_values), "centroid")
  explanations <- append(explanations, list(get_explanation(time_incr_rules, time_incr_models, time_incr_values)))
  
  performance_incr_values <- list(
    time = time,
    completion = completion,
    mobility = mobility,
    exergame_diff = exergame_diff,
    fatigue = fatigue
  )
  performance_incr <- gset_defuzzify(fuzzy_inference(performance_incr_model, performance_incr_values), "centroid")
  explanations <- append(explanations, list(get_explanation(performance_incr_rules, performance_incr_models, performance_incr_values)))

  adequacy_incr_values <- list(
    time = time,
    completion = completion,
    mobility = mobility,
    compensation = compensation,
    fatigue = fatigue
  )
  adequacy_incr <- gset_defuzzify(fuzzy_inference(adequacy_incr_model, adequacy_incr_values), "centroid")
  explanations <- append(explanations, list(get_explanation(adequacy_incr_rules, adequacy_incr_models, adequacy_incr_values)))

  return(list(
    rep_incr = rep_incr,
    set_incr = set_incr,
    time_incr = time_incr,
    performance_incr = performance_incr,
    adequacy_incr = adequacy_incr,
    explanations = explanations
  ))
}

infer_routine_increments <- function(performance, mobility, general_compensation, general_fatigue) {
  exergame_number_values <- list(
    performance = performance,
    mobility = mobility,
    compensation = general_compensation,
    fatigue = general_fatigue
  )
  exergame_number <- gset_defuzzify(fuzzy_inference(exergame_number_model, exergame_number_values))
  explanation <- get_explanation(exergame_number_rules, exergame_number_models, exergame_number_values)
  
  return(list(
    exergame_number=exergame_number,
    explanation=explanation
  ))
}

aggregate_s_owa <- function(values, beta, reverse=FALSE) {
  sorted_values <- sort(unlist(values), decreasing=reverse)
  n <- length(values)
  weights <- ifelse(1:n != n, (1/n) * (1 - beta), (1/n) * (1 - beta) + beta)
  weighted_values <- sorted_values * weights
  return(sum(weighted_values))
}

minmax_normalize <- function(value, universe) {
  return((value - min(universe)) / (max(universe) - min(universe)))
}

get_simplified_explanations <- function(exergames_data, routine_exergames) {
  dataset_exergames <- rep(exergames_data)
  dataset_exergames <- lapply(dataset_exergames, function(x) { x$explanations <- NULL; x })
  dataset_exergames <- lapply(dataset_exergames, function(x) {x[is.na(x)] <- 0; return(x)})
  dataset_exergames <- as.data.frame(do.call(rbind, dataset_exergames))
  dataset_exergames <- cbind(dataset_exergames, as.data.frame(t(data.frame(routine_exergames))))
  dataset_exergames$rep_incr <- sapply(dataset_exergames$rep_incr, function(x) { minmax_normalize(x, unv_rep_incr) })
  dataset_exergames$set_incr <- sapply(dataset_exergames$set_incr, function(x) { minmax_normalize(x, unv_set_incr) })
  dataset_exergames$time_incr <- sapply(dataset_exergames$time_incr, function(x) { minmax_normalize(x, unv_time_incr) })
  dataset_exergames$time <- sapply(dataset_exergames$time, function(x) { minmax_normalize(x, unv_time) })
  dataset_exergames$completion <- sapply(dataset_exergames$completion, function(x) { minmax_normalize(x, unv_completion) })
  dataset_exergames$exergame_diff <- sapply(dataset_exergames$exergame_diff, function(x) { minmax_normalize(x, unv_exergame_diff) })
  dataset_exergames$reps <- sapply(dataset_exergames$reps, function(x) { minmax_normalize(x, unv_reps) })
  dataset_exergames$sets <- sapply(dataset_exergames$sets, function(x) { minmax_normalize(x, unv_sets) })
  dataset_exergames$compensation <- sapply(dataset_exergames$compensation, function(x) { minmax_normalize(x, unv_compensation) })
  dataset_exergames$fatigue <- sapply(dataset_exergames$fatigue, function(x) { minmax_normalize(x, unv_fatigue) })

  dataset_exergames$adequacy_incr <- sapply(dataset_exergames$adequacy_incr, function(x) { minmax_normalize(x, unv_adequacy_incr) })

  Dbscan_cl <- dbscan(dataset_exergames, eps = 0.4, MinPts = 1)
  for (i in seq_along(exergames_data)) {
    exergames_data[[i]]$cluster <- Dbscan_cl$cluster[i]
    dataset_exergames$cluster[i] <- Dbscan_cl$cluster[i]
  }
  dataset_exergames$row_num <- seq_len(nrow(dataset_exergames))

  centroids <- aggregate(dataset_exergames, by=list(dataset_exergames$cluster), FUN=mean)
  centroids <- centroids[ , !grepl("^Group", names(centroids))]
  representative_indexes <- list()
  for (i in unique(dataset_exergames$cluster)) {
    cluster_data <- dataset_exergames[dataset_exergames$cluster == i,]
    row_differences <- data.frame(cluster_data[,1:(ncol(cluster_data)-2)])
    for (j in 1:nrow(cluster_data)) {
      row_differences[j,] <- cluster_data[j,1:(ncol(cluster_data)-2)] - centroids[centroids$cluster == i,1:(ncol(cluster_data)-2)]
    }
    distances <- sqrt(rowSums(row_differences^2))
    representative_indexes <- append(representative_indexes, list(cluster_data[which.min(distances)[[1]], , drop = FALSE]$row_num - 1))
  }
  
  return(list(
    exergames_data=exergames_data,
    representative_indexes=representative_indexes
  ))
}

infer_all_execution_data <- function(routine_json) {
  routine <- fromJSON(routine_json)
  compensations <- lapply(routine$exergames, function(exergame) exergame['compensation'])
  general_compensation <- aggregate_s_owa(compensations, 0.40)
  general_fatigue <- mean(sapply(routine$exergames, function(exergame) exergame['fatigue']))
  exergame_number_result <- infer_routine_increments(routine$performance, routine$mobility, general_compensation, general_fatigue)
  
  performance_acumulator <- list()
  exergames_data <- list()
  for(exergame in routine$exergames) {
    exergame_data <- infer_exergame_increments(exergame['time'], exergame['completion'], routine['performance'], routine['mobility'], exergame['exergame_diff'], exergame['reps'], exergame['sets'], exergame['compensation'], exergame['fatigue'])
    performance_acumulator <- c(performance_acumulator, list(exergame_data$performance_incr))
    exergame_data$performance_incr <- NULL;
    exergames_data <- append(exergames_data, list(exergame_data))
  }
  
  simplified_explanations <- get_simplified_explanations(exergames_data, routine$exergames)
  
  return(toJSON(list(
    exergame_number=exergame_number_result$exergame_number,
    exergame_number_explanation=exergame_number_result$explanation,
    performance_incr=aggregate_s_owa(performance_acumulator, 0.70, reverse=TRUE),
    exergames_data=simplified_explanations$exergames_data,
    representative_indexes=simplified_explanations$representative_indexes
  ), collapse = ''))
}

infer_exergame_diff <- function(waypoint_number, waypoint_distance) {
  exergame_diff_values <- list(
    waypoint_number = waypoint_number,
    waypoint_distance = waypoint_distance
  )
  exergame_diff <- gset_defuzzify(fuzzy_inference(exergame_diff_model, exergame_diff_values), "centroid")
  explanation <- get_explanation(exergame_diff_rules, exergame_diff_models, exergame_diff_values)

  return(list(
    exergame_diff=exergame_diff,
    explanation=explanation
  ))
}
