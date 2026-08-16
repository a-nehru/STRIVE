import { EExerciseType } from '@common-enums/exercise-type.enum';
import { ELimb } from '@common-enums/limbs.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EPoseType } from '@common-enums/pose-type.enum';
import { Exclude, Expose, Type } from 'class-transformer';
import { PaginatedResponseDto } from './paginated-response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class ExerciseDetailsForListDtoData {
  @Expose()
  @CustomApiProperty()
  id: string;

  @Expose()
  @CustomApiProperty()
  name: string;

  @Expose()
  @CustomApiProperty()
  limbs: ELimb[];

  @Expose()
  @CustomApiProperty()
  pose_type: EPoseType;

  @Expose()
  @CustomApiProperty()
  pose_side: EPoseSide;

  @Expose()
  @CustomApiProperty()
  exercise_type: EExerciseType;
}

@Exclude()
export class ExerciseDetailsForListDto extends PaginatedResponseDto {
  @Expose()
  @Type(() => ExerciseDetailsForListDtoData)
  @CustomApiProperty()
  data: ExerciseDetailsForListDtoData[];
}
