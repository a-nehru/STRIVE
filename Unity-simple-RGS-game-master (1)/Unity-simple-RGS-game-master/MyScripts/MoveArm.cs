using UnityEngine;
using System.Collections;

public class MoveArm : MonoBehaviour {

    float maxx = 5.6f, minx = -7.4f, maxy = 7.6f, miny = 2.3f, speed = 0.2f;
    public bool auto = false, action = false;
    public float mdistance = 150, mx, my, mspeed=0;
    public GameObject coll;
    float time=0, duration = 0.6f, ratio = 0,lastx=-1,posrecx=-1.2f,posrecy=5,disrec=1;
	// Use this for initialization
	void Start () {
        time = Time.time;
        this.gameObject.GetComponent<Animation>()["Take 001"].speed = 3;
    }
	
	// Update is called once per frame
	void Update () {
        if (!auto)
        {
            if (transform.position.x > minx && Input.GetAxis("Horizontal") < 0)
                transform.Translate(new Vector3(Input.GetAxis("Horizontal") * speed, 0, 0), Space.World);
            if (transform.position.x < maxx && Input.GetAxis("Horizontal") > 0)
                transform.Translate(new Vector3(Input.GetAxis("Horizontal") * speed, 0, 0), Space.World);
            if (transform.position.y > miny && Input.GetAxis("Vertical") < 0)
                transform.Translate(new Vector3(0, Input.GetAxis("Vertical") * speed, 0), Space.World);
            if (transform.position.y < maxy && Input.GetAxis("Vertical") > 0)
                transform.Translate(new Vector3(0, Input.GetAxis("Vertical") * speed, 0), Space.World);
            if (Input.GetButtonDown("Jump"))
            {
                this.gameObject.GetComponent<Animation>().Play();
                coll.GetComponent<Collider>().enabled = true;
                time = Time.time;
            }
            if (coll.GetComponent<Collider>().enabled)
            {
                if (Time.time - time > duration)
                {
                    coll.GetComponent<Collider>().enabled = false;
                }
            }
        }
        else
        {
            coll.GetComponent<Collider>().enabled = true;
            if (mdistance < 150)
            {
                if (lastx != mx)
                {
                    lastx = mx;
                    posrecx = transform.position.x;
                    posrecy = transform.position.y;
                    disrec = mdistance;
                    ratio = 0;
                }
                ratio += mspeed / disrec;
                transform.position = new Vector3(Mathf.Lerp(posrecx,mx-1.15f,ratio*1.5f), Mathf.Lerp(posrecy, my-2.3f, ratio * 1.5f),transform.position.z);
            }
        }
    }
}
