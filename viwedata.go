
package repository

type View struct {
    Time   string `json:"Time"`
    ACSTR  int    `json:"ACSTR"`
    DCSTR  int    `json:"DCSTR"`
    IOSTR  int    `json:"IOSTR"`

    ACs  []int `json:"ACs"`
    DCF  []int `json:"DCF"`
    ACF  []int `json:"ACF"`
    IOF  []int `json:"IOF"`
    HiF  []int `json:"HiF_"`
    LoD  []int `json:"LoD_"`
    LoF  []int `json:"LoF_"`

    VDC  []int `json:"VDC_"`
    IDC  []int `json:"IDC_"`
    ACtype []int `json:"ACtype"`

    VAC  []any `json:"VAC"`
    FVAC []any `json:"FVAC"`
    IAC  []any `json:"IAC"`
    SYSF []int `json:"SYSF"`

    TT  []any `json:"TT"`
    H   []any `json:"H"`
    SHT []any `json:"SHT"`
    S0  []any `json:"S0"`

    Vi   []any `json:"Vi"`
    Vo   []any `json:"Vo"`
    Pi   []any `json:"Pi"`
    Po   []any `json:"Po"`
    Vd   []any `json:"Vd"`
    Id   []any `json:"Id"`
    Trem []any `json:"Trem"`

    EqTyp int `json:"EqTyp"`
    EqS   int `json:"EqS"`
    EqDP  int `json:"EqDP"`
    Et    int `json:"Et"`
    EqR   int `json:"EqR"`
}


type RerositoryView interface {
	View() ([]View, error)
}

type RepoView struct {
	RepositoryView []View
}


func NewRepoView() RerositoryView {
	view := []View{
		{
		Time:  "Thu Feb 18 1982 22:07:27",
        ACSTR: 1,
        DCSTR: 4,
        IOSTR: 1,

        ACs: []int{0, 6},
        DCF: []int{0, 138, 266, 302, 174},
        ACF: []int{0, 32554},
        IOF: []int{0, 24576},
        HiF: []int{0, 5600, 5600, 5600, 5600},
        LoD: []int{0, 4400, 4400, 4400, 4400},
        LoF: []int{0, 5200, 5200, 5200, 5200},

        VDC: []int{0, 13384, 13011, 7092, 11035},
        IDC: []int{0, -28869, 23566, 12288, -2512},
        ACtype: []int{0, 0},

        VAC: []any{0, []int{0, 23801, 48635, 9097, 43436, 59295, 33439}},
        FVAC: []any{0, []int{0, 2, 2, 2, 2, 2, 2}},
        IAC: []any{0, []int{0, 16479, 45302, 9031, 15039, 798, 743}},
        SYSF: []int{0, 0, 2, 2, 32, 2, 32, 0, 0, 8866, 18267, 4699},

        TT:  []any{0, []int{0, 24656, 0}},
        H:   []any{0, []int{0, 58623, 0}},
        SHT: []any{0, []int{0, 1, 0}},
        S0:  []any{0, []int{0, 1, 1, 1, 1, 1, 1, 1, 1}},

        Vi:   []any{0, []float64{0, 2380.1}},
        Vo:   []any{0, []int{0}},
        Pi:   []any{0, []float64{0, 15.966}},
        Po:   []any{0, []int{0}},
        Vd:   []any{0, []float64{0, 133.84}},
        Id:   []any{0, []float64{0, -2886.9}},
        Trem: []any{0, []int{0, 0}},

        EqTyp: 0,
        EqS:   1248,
        EqDP:  0,
        Et:    0,
        EqR:   0,
		},
	}
	return &RepoView{RepositoryView: view}
}

func (r *RepoView) View() ([]View, error) {
	return r.RepositoryView, nil
}