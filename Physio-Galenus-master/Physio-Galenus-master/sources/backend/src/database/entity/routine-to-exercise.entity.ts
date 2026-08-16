import { Column, Entity, ManyToOne } from 'typeorm';
import { Exercise } from './exercise.entity';
import { Routine } from './routine.entity';

@Entity()
export class RoutineToExercise {
  @ManyToOne('Routine', 'routine_to_exercise', {
    primary: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  routine: Routine;

  @ManyToOne('Exercise', 'routine_to_exercise', {
    primary: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  exercise: Exercise;

  @Column({ default: 1 })
  time: number;

  @Column({ default: 1 })
  rest_between_sets: number;

  @Column('int', { default: 1 })
  sets: number;

  @Column('int', { default: 1 })
  reps: number;
}
