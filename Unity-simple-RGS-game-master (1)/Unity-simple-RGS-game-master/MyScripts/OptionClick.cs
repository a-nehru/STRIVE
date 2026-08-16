using UnityEngine;
using System.Collections;

public class OptionClick : MonoBehaviour {
    public GameObject control;
	// Use this for initialization
	void Start () {
        control.transform.Translate(new Vector3(-300, 0, 0), Space.World);
    }
	
	// Update is called once per frame
	void Update () {
	
	}

    public void Click()
    {
        //control.SetActive(!control.activeSelf);
        if (control.transform.position.x < 0)
            control.transform.position = new Vector3(0,control.transform.position.y,0);
        else control.transform.Translate(new Vector3(-300, 0, 0), Space.World);
    }
}
