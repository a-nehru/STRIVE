using UnityEngine;
using System.Collections;

public class MoveArmR : MonoBehaviour
{

    float maxx = 7.0f, minx = -6f, maxy = 7.6f, miny = 2.3f, speed = 0.2f;
    public bool auto = false, action = false;
    public GameObject coll,leftarm;
    float time=0, duration = 0.6f;
    // Use this for initialization
    void Start()
    {
        time = Time.time;
        this.gameObject.GetComponent<Animation>()["Take 001"].speed = 3;
    }

    // Update is called once per frame
    void Update()
    {
        if (!auto)
        {
            if (transform.position.x > minx && Input.GetAxis("Horizontalr") < 0)
                transform.Translate(new Vector3(Input.GetAxis("Horizontalr") * speed, 0, 0), Space.World);
            if (transform.position.x < maxx && Input.GetAxis("Horizontalr") > 0)
                transform.Translate(new Vector3(Input.GetAxis("Horizontalr") * speed, 0, 0), Space.World);
            if (transform.position.y > miny && Input.GetAxis("Verticalr") < 0)
                transform.Translate(new Vector3(0, Input.GetAxis("Verticalr") * speed, 0), Space.World);
            if (transform.position.y < maxy && Input.GetAxis("Verticalr") > 0)
                transform.Translate(new Vector3(0, Input.GetAxis("Verticalr") * speed, 0), Space.World);
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
            transform.position = new Vector3(leftarm.transform.position.x+2.4f, leftarm.transform.position.y, leftarm.transform.position.z);
        }
    }
}
