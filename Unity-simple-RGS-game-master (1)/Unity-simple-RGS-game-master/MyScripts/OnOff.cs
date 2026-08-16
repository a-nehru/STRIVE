using UnityEngine;
using System.Collections;
using UnityEngine.UI;

public class OnOff : MonoBehaviour {
	// Use this for initialization
    public bool israndom=false;
	void Start () {
	
	}
	
	// Update is called once per frame
	void Update () {
	
	}

    public void Click()
    {
        israndom = !israndom;
        if (israndom)
        {
            this.gameObject.GetComponentInChildren<Text>().text = "Random:ON";
        }
        else
            this.gameObject.GetComponentInChildren<Text>().text = "Random:OFF";
    }
}
