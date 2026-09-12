import BaseRepository from '../../core/base/BaseRepository.js';

import User from './user.model.js';

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  /** الدخول محتاج الهاش، والهاش مستبعد افتراضيًا، فبنطلبه صراحة هنا. */
  findByUsernameWithPassword(username) {
    return this.model
      .findOne({ username: String(username).toLowerCase() })
      .select('+password');
  }

  findByIdWithPassword(id) {
    return this.model.findById(id).select('+password');
  }

  findByUsername(username) {
    return this.findOne({ username: String(username).toLowerCase() });
  }

  countByRole(role) {
    return this.count({ role, isActive: true });
  }
}

export const userRepository = new UserRepository();

export default userRepository;
