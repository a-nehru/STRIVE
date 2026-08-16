using UnityEngine;
using System.Collections;
using UnityEngine.UI;

public class DisplaySlider : MonoBehaviour {
    public Slider slider;
    public string format="f1";
    
	// Use this for initialization
	void Start () {
	
	}
	
	// Update is called once per frame
	void Update () {
        this.GetComponent<Text>().text = slider.value.ToString(format);
	}
}
