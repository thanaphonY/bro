package repository

type User struct{
	Name string;
	Email string;
	Password string;
}

type RepositoryUser interface {
	ViewUser() ([]User, error)
}