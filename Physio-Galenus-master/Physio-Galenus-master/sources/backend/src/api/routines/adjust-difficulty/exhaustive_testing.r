source('./src/api/routines/adjust-difficulty/main.r')

u_time = seq(from=0.0, to=300.0, by=150) # Average completion time per set
u_completion = seq(from=0.0, to=100.0, by=50) # Executed number of repetitions from total
u_reps = seq(from=0.0, to=50.0, by=25) # Number of repetitions
u_sets = seq(from=0.0, to=10.0, by=5.0) # Number of sets
u_performance = seq(from=0.0, to=100.0, by=50) # Representation of the current performance level
u_adequacy = seq(from=0.0, to=100.0, by=50) # The adequacy of an exergame
u_mobility = seq(from=0.0, to=100.0, by=50) # Level of mobility of the involved joint / whole body
u_exergame_diff = seq(from=0.0, to=100.0, by=50) # Difficulty of the exergame
u_compensation = seq(from=0.0, to=100.0, by=50) # Compensation level
u_fatigue = seq(from=0.0, to=100.0, by=50) # Fatigue level


rep_incr_table <- expand.grid(time=u_time, completion=u_completion, performance=u_performance, mobility=u_mobility, exergame_diff=u_exergame_diff, compensation=u_compensation, fatigue=u_fatigue)
rep_incr_table$result <- apply(rep_incr_table, 1, function(x) gset_defuzzify(fuzzy_inference(rep_incr_model, x), "centroid"))
is_nan <- any(unlist(Map(is.nan, rep_incr_table)))

if (!is_nan) {
  set_incr_table <- expand.grid(reps=u_reps, sets=u_sets)
  set_incr_table$result <- apply(set_incr_table, 1, function(x) gset_defuzzify(fuzzy_inference(set_incr_model, x), "centroid"))
  is_nan <- any(unlist(Map(is.nan, set_incr_table)))
}
  
if (!is_nan) {
  time_incr_table <- expand.grid(time=u_time, completion=u_completion, performance=u_performance, mobility=u_mobility, exergame_diff=u_exergame_diff)
  time_incr_table$result <- apply(time_incr_table, 1, function(x) gset_defuzzify(fuzzy_inference(time_incr_model, x), "centroid"))
  is_nan <- any(unlist(Map(is.nan, time_incr_table)))
}
  
if (!is_nan) {
  performance_incr_table <- expand.grid(time=u_time, completion=u_completion, mobility=u_mobility, exergame_diff=u_exergame_diff)
  performance_incr_table$result <- apply(performance_incr_table, 1, function(x) gset_defuzzify(fuzzy_inference(performance_incr_model, x), "centroid"))
  is_nan <- any(unlist(Map(is.nan, performance_incr_table)))
}

if (!is_nan) {
  adequacy_incr_table <- expand.grid(time=u_time, completion=u_completion, mobility=u_mobility)
  adequacy_incr_table$result <- apply(adequacy_incr_table, 1, function(x) gset_defuzzify(fuzzy_inference(adequacy_incr_model, x), "centroid"))
  is_nan <- any(unlist(Map(is.nan, adequacy_incr_table)))
}

if (!is_nan) {
  exergame_number_table <- expand.grid(performance=u_performance, mobility=u_mobility, compensation=u_compensation) 
  exergame_number_table$result <- apply(exergame_number_table, 1, function(x) gset_defuzzify(fuzzy_inference(exergame_number_model, x), "centroid"))
  is_nan <- any(unlist(Map(is.nan, exergame_number_table)))
}

if (is_nan) {
  print('error')
} else {
  print('success')
}
