import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Whitelist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  username: string;
}
