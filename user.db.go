package repository

type userDBtest struct {
	users []User
}

func NewUserDB() RepositoryUser {
	initialUsers := []User{
		{
			Name:     "test",
			Email:    "test",
			Password: "test",
		},
		{
			Name:     "test2",
			Email:    "test2",
			Password: "test2",
		},
	}

	return &userDBtest{
		users: initialUsers,
	}
}

func (u *userDBtest) ViewUser() ([]User, error) {
	return u.users, nil
}